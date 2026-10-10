// In-app purchases (RevenueCat). Plumbing only: nothing is offered until the
// server turns subscriptions on for the user (GET /users/me →
// features.subscriptions_visible), and the server — never this module —
// decides what a purchase unlocks (POST /users/me/subscription/sync re-reads
// RevenueCat).
//
// The native module is required defensively, like PostHog: an OTA update
// landing on a build without react-native-purchases degrades to "unavailable"
// instead of crashing. Without a public SDK key for the platform (config.js)
// everything is unavailable too.
import { Platform } from 'react-native';
import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from '../config';

let Purchases = null;
try {
  // eslint-disable-next-line global-require
  Purchases = require('react-native-purchases').default ?? null;
} catch (e) {
  Purchases = null;
}

// Store pages for managing a subscription when RevenueCat has no direct link.
const STORE_SUBSCRIPTIONS_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: null,
});

const apiKey = () =>
  Platform.select({ ios: REVENUECAT_IOS_KEY, android: REVENUECAT_ANDROID_KEY, default: '' }) || '';

let configured = false;
let currentUserId = null;

// Identity changes run strictly one after another: a logOut still in flight
// must never land after the next account's logIn (the purchase would be
// recorded anonymously and never unlock anything).
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/** Whether this build can make purchases at all (native module + key present). */
export const isAvailable = () => !!Purchases && !!apiKey();

/**
 * Why purchases are (un)available here: 'ready', 'no_module' (a build from
 * before purchases — updating the app fixes it) or 'no_key' (this build has
 * no store key — updating won't help).
 */
export const purchasesStatus = () => (!Purchases ? 'no_module' : !apiKey() ? 'no_key' : 'ready');

/**
 * What kind of failure a purchase error is, for the message shown:
 * 'already_owned' (the store account already holds it — Restore fixes it),
 * 'unavailable', 'network' or 'other'.
 */
export function purchaseErrorKind(err) {
  const codes = Purchases?.PURCHASES_ERROR_CODE || {};
  const code = err?.code;
  if (code === 'PURCHASES_UNAVAILABLE' || (code && code === codes.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR)) return 'unavailable';
  if (code && (code === codes.PRODUCT_ALREADY_PURCHASED_ERROR || code === codes.RECEIPT_ALREADY_IN_USE_ERROR)) return 'already_owned';
  if (code && code === codes.NETWORK_ERROR) return 'network';
  return 'other';
}

// INTRO_ELIGIBILITY_STATUS_ELIGIBLE in react-native-purchases.
const INTRO_ELIGIBLE = 2;

/**
 * iOS reports a product's intro offer whether or not this Apple ID already
 * used it, so ask StoreKit. Anything but a clear "eligible" hides the trial:
 * promising a free trial and then charging is worse than not mentioning it.
 * (Google Play only returns offers the account is eligible for.)
 */
async function introEligibleProducts(productIds) {
  if (Platform.OS !== 'ios' || productIds.length === 0) return null;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    return new Set(productIds.filter((id) => result?.[id]?.status === INTRO_ELIGIBLE));
  } catch (e) {
    return new Set();
  }
}

/**
 * Only accounts that can see subscriptions — or already have a plan — are
 * identified to RevenueCat, so no RevenueCat customer exists for anyone while
 * the feature is dark.
 */
export const shouldUsePurchases = (user) =>
  !!user?.id && (!!user?.features?.subscriptions_visible || !!user?.plan?.active);

/**
 * Identify the signed-in account to RevenueCat by its id, exactly as the
 * server stores it (the webhook and sync look customers up by it). Safe to
 * call repeatedly. Resolves false when unavailable or on error (never throws).
 */
export function loginPurchases(userId) {
  if (!isAvailable() || !userId) return Promise.resolve(false);
  const id = String(userId);
  return serial(async () => {
    try {
      if (!configured) {
        Purchases.configure({ apiKey: apiKey(), appUserID: id });
        configured = true;
        currentUserId = id;
      } else if (currentUserId !== id) {
        await Purchases.logIn(id);
        currentUserId = id;
      }
      return true;
    } catch (e) {
      return false;
    }
  });
}

/** Forget the account on this device (logout / account deletion). Never throws. */
export function logoutPurchases() {
  return serial(async () => {
    if (!configured || currentUserId === null) return;
    try {
      await Purchases.logOut();
    } catch (e) {
      // Already anonymous — nothing to do.
    }
    currentUserId = null;
  });
}

/**
 * Make sure RevenueCat is identified as this account before a store call.
 * Throws PURCHASES_UNAVAILABLE when it can't be (no key / old build / offline).
 */
export async function ensurePurchases(userId) {
  if (!(await loginPurchases(userId)) || currentUserId !== String(userId)) {
    throw unavailable();
  }
}

function unavailable() {
  const err = new Error('PURCHASES_UNAVAILABLE');
  err.code = 'PURCHASES_UNAVAILABLE';
  return err;
}

function requireReady() {
  if (!configured || currentUserId === null) {
    throw unavailable();
  }
}

/**
 * The current offering's packages, ready to render (prices come from the
 * store, localized). null when there is no current offering.
 */
export async function getOfferings() {
  requireReady();
  const offerings = await Purchases.getOfferings();
  const current = offerings?.current;
  if (!current) return null;
  const available = current.availablePackages || [];
  const withIntro = available.filter((p) => p.product?.introPrice).map((p) => p.product.identifier);
  const eligible = await introEligibleProducts(withIntro);
  const introFor = (product) =>
    product?.introPrice && (eligible === null || eligible.has(product.identifier)) ? product.introPrice : null;
  return {
    identifier: current.identifier,
    packages: available.map((pkg) => ({
      identifier: pkg.identifier,
      packageType: pkg.packageType, // MONTHLY | ANNUAL | LIFETIME | …
      product: {
        identifier: pkg.product?.identifier,
        title: pkg.product?.title,
        priceString: pkg.product?.priceString,
        price: pkg.product?.price,
        currencyCode: pkg.product?.currencyCode,
        subscriptionPeriod: pkg.product?.subscriptionPeriod ?? null, // ISO 8601, e.g. P1M
        introPrice: introFor(pkg.product),
      },
      raw: pkg, // what purchasePackage() needs
    })),
  };
}

/**
 * Buy a package from getOfferings(). Resolves { status }: 'purchased',
 * 'cancelled' (the user backed out — not an error) or 'pending' (awaiting
 * payment, e.g. Ask to Buy). Throws on real failures.
 */
export async function purchasePackage(pkg) {
  requireReady();
  try {
    await Purchases.purchasePackage(pkg?.raw ?? pkg);
    return { status: 'purchased' };
  } catch (e) {
    const codes = Purchases.PURCHASES_ERROR_CODE || {};
    if (e?.userCancelled || (codes.PURCHASE_CANCELLED_ERROR && e?.code === codes.PURCHASE_CANCELLED_ERROR)) {
      return { status: 'cancelled' };
    }
    if (codes.PAYMENT_PENDING_ERROR && e?.code === codes.PAYMENT_PENDING_ERROR) {
      return { status: 'pending' };
    }
    throw e;
  }
}

/** Restore the store account's purchases onto this account. Resolves { status: 'restored' }. */
export async function restorePurchases() {
  requireReady();
  await Purchases.restorePurchases();
  return { status: 'restored' };
}

/** Where the user manages / cancels their subscription (store settings). */
export async function getManagementUrl() {
  if (configured && currentUserId !== null) {
    try {
      const info = await Purchases.getCustomerInfo();
      if (info?.managementURL) return info.managementURL;
    } catch (e) {
      // fall through to the generic store page
    }
  }
  return STORE_SUBSCRIPTIONS_URL;
}

/** Test hook: reset module state between tests. */
export function __resetForTests() {
  configured = false;
  currentUserId = null;
  queue = Promise.resolve();
}
