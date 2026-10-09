import { Platform } from 'react-native';
import { File as FileSystemFile } from 'expo-file-system';
import { API_URL } from '../config';
import { getTokens, storeTokens, clearTokens } from './tokenStorage';

// Re-exported so callers keep one import surface for auth plumbing.
export { getTokens, storeTokens, clearTokens };

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * A transport failure (offline, DNS, TLS) as an Error tagged isNetworkError,
 * so callers and the crash-report filter (scrub.js) can tell "no connection"
 * from a bug. The URL (record ids, signed links) is only included in dev.
 */
export function networkError(cause, url) {
  if (__DEV__) console.log('[API ERROR]', cause?.message, 'URL was:', url);
  const err = new Error(`Network error: ${cause?.message || 'unknown'}${__DEV__ && url ? ` (${url})` : ''}`);
  err.isNetworkError = true;
  return err;
}

/** fetch() whose transport failures are tagged via networkError(). */
export async function netFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw networkError(e, url);
  }
}

// ── Token refresh (deduplicated so parallel 401s only refresh once) ───────────

// Only these mean the refresh token itself was rejected (invalid, expired,
// revoked, account disabled). Offline and 5xx failures keep the session —
// logging someone out because the network blipped wiped valid sessions.
const SESSION_ENDED = new Set([401, 403, 422]);

let _refreshPromise = null;

// Exported for authed raw fetches outside request() (uploads, export download)
// so every caller shares the same deduplicated refresh.
export async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const { refresh } = await getTokens();
    if (!refresh) throw new Error('SESSION_EXPIRED');

    const res = await netFetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ refresh_token: refresh }),
    });

    if (SESSION_ENDED.has(res.status)) {
      await clearTokens();
      throw new Error('SESSION_EXPIRED');
    }
    if (!res.ok) {
      const err = new Error(`Couldn't refresh your session (${res.status})`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    await storeTokens(data.access_token, data.refresh_token);
    return data.access_token;
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

// ── Core request ──────────────────────────────────────────────────────────────

export async function request(method, path, body, { skipAuth = false } = {}) {
  const { access } = await getTokens();

  const headers = {
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
  };
  if (!skipAuth && access) headers['Authorization'] = `Bearer ${access}`;

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const url = `${API_URL}${path}`;
  // Request logs are dev-only: release builds would write record ids and
  // signed URLs to the device log.
  if (__DEV__) console.log('[API]', method, url);
  let res = await netFetch(url, init);
  if (__DEV__) console.log('[API]', res.status, url);

  // Auto-refresh on 401. A rejected refresh throws SESSION_EXPIRED; offline or
  // server errors propagate as-is so the session survives them.
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    res = await netFetch(url, {
      ...init,
      headers: { ...headers, Authorization: `Bearer ${newToken}` },
    });
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.detail || `Request failed (${res.status})`;
    const err = new Error(Array.isArray(msg) ? msg[0]?.msg ?? 'Validation error' : msg);
    err.status = res.status;
    if (data?.code) err.code = data.code;
    throw err;
  }

  return data;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const get  = (path, opts) => request('GET',    path, undefined, opts);
export const post = (path, body, opts) => request('POST',   path, body, opts);
export const patch = (path, body, opts) => request('PATCH',  path, body, opts);
export const put  = (path, body, opts) => request('PUT',    path, body, opts);
export const del  = (path, opts) => request('DELETE', path, undefined, opts);

// ── Image upload (multipart) ──────────────────────────────────────────────────

// Expo SDK 57's global fetch is the WinterCG implementation, whose multipart
// encoder only accepts web-standard Blob/File parts — it rejects React Native's
// classic { uri, name, type } descriptor with "Unsupported FormDataPart
// implementation", so every upload has to hand it a real Blob/File.
//   • Web: the picker returns a blob:/data: URI — fetch it into a File.
//   • Native: expo-file-system's File implements Blob (carrying bytes() + a
//     filename), which the encoder serializes correctly.
async function asFormFile(uri, name, type) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new File([blob], name, { type: blob.type || type });
  }
  return new FileSystemFile(uri);
}

export async function uploadImage(localUri) {
  const name = (localUri.split('/').pop() || 'photo.jpg').split('?')[0];
  const ext = (/\.(\w+)$/.exec(name)?.[1] || 'jpg').toLowerCase();
  const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const filePart = await asFormFile(localUri, name, type);

  const send = (token) => {
    const form = new FormData();
    form.append('file', filePart);
    return netFetch(`${API_URL}/uploads`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'bypass-tunnel-reminder': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  };

  const { access } = await getTokens();
  let res = await send(access);

  // Share the request() refresh path: retry once with a fresh token on 401.
  if (res.status === 401) {
    res = await send(await refreshAccessToken());
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Image upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.url; // relative /storage/... path, resolved client-side
}

// ── Document upload (multipart: file + metadata in one request) ───────────────

export async function uploadDocument(petId, file, fields = {}) {
  const name = (file.name || file.uri.split('/').pop() || 'document.jpg').split('?')[0];
  const ext = (/\.(\w+)$/.exec(name)?.[1] || 'jpg').toLowerCase();
  const type = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const filePart = await asFormFile(file.uri, name, type);

  const send = (token) => {
    const form = new FormData();
    form.append('file', filePart);
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    });
    return netFetch(`${API_URL}/pets/${petId}/documents`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'bypass-tunnel-reminder': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  };

  const { access } = await getTokens();
  let res = await send(access);

  // Retry once with a fresh token on 401 (mirrors uploadImage).
  if (res.status === 401) {
    res = await send(await refreshAccessToken());
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || `Document upload failed (${res.status})`);
  }
  return data; // the created document record
}
