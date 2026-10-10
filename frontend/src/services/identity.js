// Who the current user is, for product analytics, crash reports and in-app
// purchases — set and cleared together so a sign-in path can't update one and
// forget the other. All record the account id only (never email or name).
import { identifyUser, resetAnalytics } from './analytics';
import { loginPurchases, logoutPurchases, shouldUsePurchases } from './purchases';
import { clearSentryUser, setSentryUser } from './sentry';

export function identify(user) {
  identifyUser(user);
  setSentryUser(user);
  // RevenueCat only once subscriptions are visible to the account (or it has a
  // plan), so no RevenueCat customer is created while the feature is dark.
  if (shouldUsePurchases(user)) loginPurchases(user.id);
}

export function resetIdentity() {
  resetAnalytics();
  clearSentryUser();
  logoutPurchases();
}
