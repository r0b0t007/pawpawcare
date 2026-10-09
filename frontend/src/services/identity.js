// Who the current user is, for product analytics and crash reports — set and
// cleared together so a sign-in path can't update one and forget the other.
// Both record the account id only (never email or name).
import { identifyUser, resetAnalytics } from './analytics';
import { clearSentryUser, setSentryUser } from './sentry';

export function identify(user) {
  identifyUser(user);
  setSentryUser(user);
}

export function resetIdentity() {
  resetAnalytics();
  clearSentryUser();
}
