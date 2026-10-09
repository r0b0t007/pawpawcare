// PostHog product analytics — manual events only (autocapture and session
// replay are deliberately OFF: this app holds pet medical records, so we never
// want screen content captured). All helpers are no-ops when no key is set, and
// the native module is required defensively so an OTA update landing on an older
// build (without the PostHog native deps) degrades to no-op instead of crashing.
import { POSTHOG_HOST, POSTHOG_KEY } from '../config';
import { getPref, setPref } from './prefs';

let posthog = null;
try {
  if (POSTHOG_KEY) {
    // eslint-disable-next-line global-require
    const PostHog = require('posthog-react-native').default;
    posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  }
} catch (e) {
  // Native module absent (e.g. OTA onto a build without PostHog) — stay silent.
  posthog = null;
}

// No PostHogProvider is mounted (manual events only); the core client persists
// its queue to storage and flushes on its own timer/count, so events survive a
// backgrounded app. Call the helpers below directly.

// ── Opt-out ("Share usage analytics" in Profile → Privacy) ────────────────────
// PostHog persists optOut() itself, so captures right after launch already
// respect it — but reset() (every logout) clears it. A device-local copy is
// kept so the choice is re-applied after reset, and the account's server value
// (users.analytics_opt_out) wins whenever a user is identified.
const OPT_OUT_PREF = 'analyticsOptOut';
let optedOut = false;
let currentUserId = null;

const applyOptOut = () => {
  try { if (optedOut) posthog?.optOut(); else posthog?.optIn(); } catch {}
};

// Load the stored choice; only re-apply an opt-out (PostHog's own persisted
// state already covers the default).
export const analyticsReady = getPref(OPT_OUT_PREF, false).then((stored) => {
  optedOut = stored === true;
  if (optedOut) applyOptOut();
});

/** Opt in or out of product analytics on this device. */
export const setAnalyticsEnabled = (enabled) => {
  optedOut = !enabled;
  setPref(OPT_OUT_PREF, optedOut);
  applyOptOut();
  // Identification is skipped while opted out; tie events back on opt-in.
  try { if (enabled && currentUserId) posthog?.identify(currentUserId); } catch {}
};

export const isAnalyticsEnabled = () => !optedOut;

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
  if (typeof user.analytics_opt_out === 'boolean' && user.analytics_opt_out !== optedOut) {
    optedOut = user.analytics_opt_out;
    setPref(OPT_OUT_PREF, optedOut);
    applyOptOut();
  }
  try { if (!optedOut) posthog?.identify(currentUserId); } catch {}
};

/** Clear identity on logout so the next user starts a fresh anonymous id. */
export const resetAnalytics = () => {
  currentUserId = null;
  try { posthog?.reset(); } catch {}
  // reset() also clears PostHog's persisted opt-out; keep the device's choice.
  if (optedOut) applyOptOut();
};

/** Record a screen view (route name only — never screen content). */
export const trackScreen = (name) => {
  try { if (name) posthog?.screen(name); } catch {}
};
