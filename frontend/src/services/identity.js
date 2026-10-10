// Who the current user is, for product analytics, crash reports and in-app
// purchases — set and cleared together so a sign-in path can't update one and
// forget the other. All record the account id only (never email or name).
import { identifyUser, resetAnalytics } from './analytics';
import { loginPurchases, logoutPurchases, shouldUsePurchases } from './purchases';
import { clearSentryUser, setSentryUser } from './sentry';

export function identify(user) {
  identifyUser(user);
  setSentryUser(user);
  // RevenueCat only while subscriptions are visible to the account (or it has
  // a plan): no RevenueCat customer is created while the feature is dark, and
  // switching visibility off again logs the account back out.
  if (shouldUsePurchases(user)) loginPurchases(user.id);
  else logoutPurchases();
}

export function resetIdentity() {
  resetAnalytics();
  clearSentryUser();
  logoutPurchases();
}
