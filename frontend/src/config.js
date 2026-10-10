// Set EXPO_PUBLIC_API_URL in frontend/.env.local for local dev (see README).
// Android emulator → http://10.0.2.2:8000
// iOS simulator    → http://localhost:8000
// Physical device  → use localtunnel (see README)
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';

// PostHog product analytics (US cloud by default). Set EXPO_PUBLIC_POSTHOG_KEY
// in frontend/.env.local to enable; left unset, all analytics no-op (dev/CI).
export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// Sentry crash reporting (project pawpawcare-app). The DSN is a public client
// key that ships inside the app, so it's committed here rather than in
// eas.json: eas.json is part of the runtime fingerprint, and editing it would
// cut OTA updates off from installed builds. Reporting is off in __DEV__
// (services/sentry.js). EXPO_PUBLIC_SENTRY_DSN overrides it; any value that
// isn't an https DSN (e.g. "off" — EAS rejects empty env values) disables
// reporting, which e2e/test builds use to stay out of the real project.
const SENTRY_DSN_DEFAULT =
  'https://ba10a27c2db4831f5d7b45b01d5c12f6@o4512223191105536.ingest.us.sentry.io/4512223210504192';
const sentryDsnEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const SENTRY_DSN =
  sentryDsnEnv === undefined ? SENTRY_DSN_DEFAULT : sentryDsnEnv.startsWith('https://') ? sentryDsnEnv : '';

// Google sign-in OAuth client IDs (from Google Cloud Console → Credentials).
// WEB is the ID token's audience — it MUST match the backend's GOOGLE_WEB_CLIENT_ID.
// IOS is the native iOS client (its reversed value is the app.json iosUrlScheme).
// Set both in eas.json env (per build profile) / .env.local. Left unset, the
// Google button renders but sign-in fails until configured — Google sign-in is
// effectively disabled, matching the backend endpoint's 503.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

// RevenueCat public SDK keys (RevenueCat → Apps: appl_… for iOS, goog_… for
// Android; test_… for its Test Store in dev builds). Public client keys that
// ship inside the app — committed here like the Sentry DSN rather than in
// eas.json, which is part of the runtime fingerprint. Empty = in-app purchases
// unavailable (the default until the store apps are set up).
// EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY override. Anything else — above
// all a secret sk_ key — is refused: it must never ship in the app.
const REVENUECAT_IOS_KEY_DEFAULT = '';
const REVENUECAT_ANDROID_KEY_DEFAULT = '';
const publicSdkKey = (value, prefixes) =>
  typeof value === 'string' && prefixes.some((p) => value.startsWith(p)) ? value : '';
export const REVENUECAT_IOS_KEY = publicSdkKey(
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? REVENUECAT_IOS_KEY_DEFAULT,
  ['appl_', 'test_'],
);
export const REVENUECAT_ANDROID_KEY = publicSdkKey(
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? REVENUECAT_ANDROID_KEY_DEFAULT,
  ['goog_', 'test_'],
);

// Resolve a stored asset path to a loadable URL. Server uploads are stored as a
// relative `/storage/...` path so the same value works across emulator/device/tunnel.
export const resolveAsset = (path) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};