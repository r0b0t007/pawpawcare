// PostHog product analytics: the app's own track()/trackScreen() events, plus
// PostHog's app lifecycle events (Application Installed / Updated / Opened /
// Backgrounded), which feed its active-user and retention views. Autocapture
// and session replay are deliberately OFF: this app holds pet medical records,
// so we never want screen content captured; error autocapture is off too (Sentry
// handles crashes). All of it stops when the user opts out (Profile → Privacy).
// The device's choice applies at once; an account's choice is only known after
// sign-in, so a fresh install sends Installed/Opened before it can apply.
// All helpers are no-ops when no key is set, and
// the native module is required defensively so an OTA update landing on an older
// build (without the PostHog native deps) degrades to no-op instead of crashing.
import { POSTHOG_HOST, POSTHOG_KEY } from '../config';

// 'Application Opened' carries the URL that cold-started the app. A link can
// hold a token, so the URL never leaves the device.
export const dropLaunchUrl = (event) => {
  if (event?.event !== 'Application Opened' || !event.properties || !('url' in event.properties)) {
    return event;
  }
  const properties = { ...event.properties };
  delete properties.url;
  return { ...event, properties };
};

let posthog = null;
// Persisted properties that survive logout's reset() (see resetAnalytics).
let keepOnReset = [];
try {
  if (POSTHOG_KEY) {
    // eslint-disable-next-line global-require
    const { default: PostHog, PostHogPersistedProperty } = require('posthog-react-native');
    // Spelled out rather than left to PostHog's defaults, which can change
    // between versions: lifecycle events on, session replay and error
    // autocapture off.
    posthog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      errorTracking: { autocapture: false },
      before_send: dropLaunchUrl,
    });
    // Passing a list replaces PostHog's own keep-list, so it is repeated here:
    // without the install markers every relaunch after a logout would count as
    // a new install, on a new device id.
    keepOnReset = [
      PostHogPersistedProperty.OptedOut,
      PostHogPersistedProperty.InstalledAppBuild,
      PostHogPersistedProperty.InstalledAppVersion,
      PostHogPersistedProperty.DeviceId,
    ];
  }
} catch (e) {
  // Native module absent (e.g. OTA onto a build without PostHog) — stay silent.
  posthog = null;
}

// No PostHogProvider is mounted: our events go through the helpers below, and
// the lifecycle events come from the client itself. The core client persists
// its queue to storage and flushes on its own timer/count, so events survive a
// backgrounded app.

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
