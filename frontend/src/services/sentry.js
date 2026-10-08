// Crash reporting (Sentry). The native SDK ships with the build that added it;
// an OTA update can still land on an older binary without it, so the module is
// required defensively and every helper degrades to a no-op. Nothing is sent
// until initSentry() is wired up with a DSN (next step of the rollout).
const noop = () => {};

let Sentry = null;
try {
  // eslint-disable-next-line global-require
  Sentry = require('@sentry/react-native');
} catch (e) {
  Sentry = null;
}

/** True when this binary includes the Sentry native SDK. */
export const isSentryAvailable = () => Sentry !== null;

export const initSentry = noop;

/** Wraps the root component (identity until initSentry() is live). */
export const wrapRoot = (component) => component;

export const captureException = noop;
export const setSentryUser = noop;
export const clearSentryUser = noop;
