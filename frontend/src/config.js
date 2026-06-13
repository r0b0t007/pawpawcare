// Set EXPO_PUBLIC_API_URL in frontend/.env.local for local dev (see README).
// Android emulator → http://10.0.2.2:8000
// iOS simulator    → http://localhost:8000
// Physical device  → use localtunnel (see README)
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';

// PostHog product analytics (US cloud by default). Set EXPO_PUBLIC_POSTHOG_KEY
// in frontend/.env.local to enable; left unset, all analytics no-op (dev/CI).
export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// Resolve a stored asset path to a loadable URL. Server uploads are stored as a
// relative `/storage/...` path so the same value works across emulator/device/tunnel.
export const resolveAsset = (path) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};