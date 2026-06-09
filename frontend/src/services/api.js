import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

const KEYS = {
  ACCESS: '@pawpawcare/access_token',
  REFRESH: '@pawpawcare/refresh_token',
};

// ── Token storage ─────────────────────────────────────────────────────────────

export async function storeTokens(accessToken, refreshToken) {
  await AsyncStorage.multiSet([
    [KEYS.ACCESS, accessToken],
    [KEYS.REFRESH, refreshToken],
  ]);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([KEYS.ACCESS, KEYS.REFRESH]);
}

async function getTokens() {
  const pairs = await AsyncStorage.multiGet([KEYS.ACCESS, KEYS.REFRESH]);
  return { access: pairs[0][1], refresh: pairs[1][1] };
}

// ── Token refresh (deduplicated so parallel 401s only refresh once) ───────────

let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const { refresh } = await getTokens();
    if (!refresh) throw new Error('SESSION_EXPIRED');

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ refresh_token: refresh }),
    });

    if (!res.ok) {
      await clearTokens();
      throw new Error('SESSION_EXPIRED');
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
  console.log('[API]', method, url);
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    console.log('[API ERROR]', e?.message, 'URL was:', url);
    throw new Error(`Network error: ${e?.message || 'unknown'} (${url})`);
  }
  console.log('[API]', res.status, url);

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch {
      throw new Error('SESSION_EXPIRED');
    }
    res = await fetch(`${API_URL}${path}`, {
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
    throw err;
  }

  return data;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const get  = (path, opts) => request('GET',    path, undefined, opts);
export const post = (path, body, opts) => request('POST',   path, body, opts);
export const patch = (path, body, opts) => request('PATCH',  path, body, opts);
export const del  = (path, opts) => request('DELETE', path, undefined, opts);

// ── Image upload (multipart) ──────────────────────────────────────────────────

export async function uploadImage(localUri) {
  const name = (localUri.split('/').pop() || 'photo.jpg').split('?')[0];
  const ext = (/\.(\w+)$/.exec(name)?.[1] || 'jpg').toLowerCase();
  const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const send = (token) => {
    const form = new FormData();
    form.append('file', { uri: localUri, name, type });
    return fetch(`${API_URL}/uploads`, {
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
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch {
      throw new Error('SESSION_EXPIRED');
    }
    res = await send(newToken);
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

  const send = (token) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name, type });
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    });
    return fetch(`${API_URL}/pets/${petId}/documents`, {
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
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch {
      throw new Error('SESSION_EXPIRED');
    }
    res = await send(newToken);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || `Document upload failed (${res.status})`);
  }
  return data; // the created document record
}
