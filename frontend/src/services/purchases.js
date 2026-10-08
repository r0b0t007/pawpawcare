// In-app subscriptions (RevenueCat). Same defensive pattern as analytics.js:
// binaries built before react-native-purchases was added don't have the native
// module, and an OTA update must not crash them — callers check
// isPurchasesAvailable() and show "update the app to subscribe" instead.
// Configuration, offerings and purchase flows land with the subscription work;
// until then nothing talks to RevenueCat.
let Purchases = null;
try {
  // eslint-disable-next-line global-require
  Purchases = require('react-native-purchases').default;
} catch (e) {
  Purchases = null;
}

/** True when this binary includes the RevenueCat native SDK. */
export const isPurchasesAvailable = () => Purchases != null;
