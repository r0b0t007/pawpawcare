// PostHog product analytics — manual events only (autocapture and session
// replay are deliberately OFF: this app holds pet medical records, so we never
// want screen content captured). All helpers are no-ops when no key is set, and
// the native module is required defensively so an OTA update landing on an older
// build (without the PostHog native deps) degrades to no-op instead of crashing.
import { POSTHOG_HOST, POSTHOG_KEY } from '../config';

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

/** Capture a product event. Keep props non-sensitive — no names or record content. */
export const track = (event, props) => {
  try { posthog?.capture(event, props); } catch {}
};

/** Tie events to a stable user. Identifies by id only — no email/name PII. */
export const identifyUser = (user) => {
  try { if (user?.id) posthog?.identify(String(user.id)); } catch {}
};

/** Clear identity on logout so the next user starts a fresh anonymous id. */
export const resetAnalytics = () => {
  try { posthog?.reset(); } catch {}
};

/** Record a screen view (route name only — never screen content). */
export const trackScreen = (name) => {
  try { if (name) posthog?.screen(name); } catch {}
};
