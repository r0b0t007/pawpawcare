// Crash reporting (Sentry). Off in development and whenever no DSN is set, so
// local runs, Expo Go and CI never report. Everything that leaves the device
// goes through services/scrub.js first: no screenshots, no view hierarchy, no
// session replay, no IP, no request bodies — this app holds pet medical
// records. Expo Updates info (update id, channel, runtime) is attached by the
// SDK automatically.
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { SENTRY_DSN } from '../config';
import { scrubBreadcrumb, scrubEvent, scrubTransaction } from './scrub';

const navigationIntegration = Sentry.reactNavigationIntegration();

let enabled = false;

export function initSentry() {
  if (!SENTRY_DSN || __DEV__) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    // "production" for store builds, "preview" for tester builds.
    environment: Updates.channel || 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0.1,
    integrations: [navigationIntegration],
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
  });
  enabled = true;
}

/** Wraps the root component (error handlers, touch/perf instrumentation). */
export const wrapRoot = (component) => Sentry.wrap(component);

/** Call from the NavigationContainer's onReady: route-change spans + breadcrumbs. */
export function registerNavigation(navigationRef) {
  if (enabled) navigationIntegration.registerNavigationContainer(navigationRef);
}

/** Tags reports with the account id only — never email or name. */
export function setSentryUser(user) {
  Sentry.setUser(user?.id ? { id: String(user.id) } : null);
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

/** Reports a handled error; returns the event id ('' when reporting is off). */
export function captureException(error) {
  return enabled ? Sentry.captureException(error) : '';
}

export const isSentryEnabled = () => enabled;

export const ErrorBoundary = Sentry.ErrorBoundary;
