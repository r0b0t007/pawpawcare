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
      headers: { 'Content-Type': 'application/json' },
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

  const headers = { 'Content-Type': 'application/json' };
  if (!skipAuth && access) headers['Authorization'] = `Bearer ${access}`;

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res = await fetch(`${API_URL}${path}`, init);

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
