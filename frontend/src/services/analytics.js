// PostHog product analytics: the app's own track()/trackScreen() events, plus
// PostHog's app lifecycle events (Application Installed / Updated / Opened /
// Backgrounded), which feed its active-user and retention views. Autocapture
// and session replay are deliberately OFF: this app holds pet medical records,
// so we never want screen content captured. All of it stops when the user opts
// out (Profile → Privacy). All helpers are no-ops when no key is set, and
// the native module is required defensively so an OTA update landing on an older
// build (without the PostHog native deps) degrades to no-op instead of crashing.
import { POSTHOG_HOST, POSTHOG_KEY } from '../config';

let posthog = null;
// Persisted properties that survive logout's reset() (see resetAnalytics).
let keepOnReset = [];
try {
  if (POSTHOG_KEY) {
    // eslint-disable-next-line global-require
    const { default: PostHog, PostHogPersistedProperty } = require('posthog-react-native');
    // Spelled out rather than left to PostHog's defaults, which can change
    // between versions: lifecycle events on, session replay off.
    posthog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
    });
    keepOnReset = [PostHogPersistedProperty.OptedOut];
  }
} catch (e) {
  // Native module absent (e.g. OTA onto a build without PostHog) — stay silent.
  posthog = null;
}

// No PostHogProvider is mounted (manual events only); the core client persists
// its queue to storage and flushes on its own timer/count, so events survive a
// backgrounded app. Call the helpers below directly.

// ── Opt-out ("Share usage analytics" in Profile → Privacy) ────────────────────
// PostHog persists optIn()/optOut() itself — the single source of truth on the
// device, so captures right after launch already respect it. Logout's reset()
// keeps that property; the account's server value (users.analytics_opt_out)
// wins whenever a user is identified, so the choice follows the account.
let currentUserId = null;

/** Whether product analytics is on for this device (PostHog's own state). */
export const isAnalyticsEnabled = () => {
  try { return !(posthog?.optedOut ?? false); } catch { return true; }
};

/** Opt in or out of product analytics on this device. */
export const setAnalyticsEnabled = (enabled) => {
  try {
    if (enabled) {
      posthog?.optIn();
      // Identification is skipped while opted out; tie events back on opt-in.
      if (currentUserId) posthog?.identify(currentUserId);
    } else {
      posthog?.optOut();
    }
  } catch {}
};

/** Capture a product event. Keep props non-sensitive — no names or record content. */
export const track = (event, props) => {
  try { posthog?.capture(event, props); } catch {}
};

/**
 * Tie events to a stable user. Identifies by id only — no email/name PII.
 * The account's analytics_opt_out (server) wins over this device's choice.
 */
export const identifyUser = (user) => {
  if (!user?.id) return;
  currentUserId = String(user.id);
  try {
    let optedOut = posthog?.optedOut ?? false;
    if (typeof user.analytics_opt_out === 'boolean') {
      optedOut = user.analytics_opt_out;
      if (optedOut) posthog?.optOut();
      else posthog?.optIn();
    }
    if (!optedOut) posthog?.identify(currentUserId);
  } catch {}
};

/** Clear identity on logout so the next user starts a fresh anonymous id. */
export const resetAnalytics = () => {
  currentUserId = null;
  // reset() would also clear the persisted opt-out; keep the device's choice.
  try { posthog?.reset(keepOnReset); } catch {}
};

/** Record a screen view (route name only — never screen content). */
export const trackScreen = (name) => {
  try { if (name) posthog?.screen(name); } catch {}
};
