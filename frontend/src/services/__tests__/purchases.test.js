// RevenueCat plumbing: identification, purchase outcomes, fallbacks.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(() => Promise.resolve({ customerInfo: {}, created: false })),
    logOut: jest.fn(() => Promise.resolve({})),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(() => Promise.resolve({})),
    getCustomerInfo: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1', PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5', PRODUCT_ALREADY_PURCHASED_ERROR: '6',
      RECEIPT_ALREADY_IN_USE_ERROR: '7', NETWORK_ERROR: '10', PAYMENT_PENDING_ERROR: '20',
    },
  },
}));
jest.mock('../../config', () => ({
  REVENUECAT_IOS_KEY: 'appl_test',
  REVENUECAT_ANDROID_KEY: 'goog_test',
}));

import Purchases from 'react-native-purchases';
import {
  __resetForTests,
  ensurePurchases,
  purchaseErrorKind,
  purchasesStatus,
  getManagementUrl,
  getOfferings,
  isAvailable,
  loginPurchases,
  logoutPurchases,
  purchasePackage,
  restorePurchases,
  shouldUsePurchases,
} from '../purchases';

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests();
});

describe('who is identified to RevenueCat', () => {
  it('only accounts that can see subscriptions or already have a plan', () => {
    expect(shouldUsePurchases({ id: 'u1', features: { subscriptions_visible: false } })).toBe(false);
    expect(shouldUsePurchases({ id: 'u1', features: { subscriptions_visible: true } })).toBe(true);
    expect(shouldUsePurchases({ id: 'u1', plan: { active: true } })).toBe(true);
    expect(shouldUsePurchases(null)).toBe(false);
  });

  it('configures once with the account id, then logs in on a user switch', async () => {
    expect(isAvailable()).toBe(true);
    await loginPurchases('u1');
    await loginPurchases('u1');
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: expect.stringMatching(/^(appl|goog)_test$/), appUserID: 'u1' });
    expect(Purchases.logIn).not.toHaveBeenCalled();

    await loginPurchases('u2');
    expect(Purchases.logIn).toHaveBeenCalledWith('u2');
  });

  it('logs out on logout, and logs back in afterwards', async () => {
    await loginPurchases('u1');
    await logoutPurchases();
    expect(Purchases.logOut).toHaveBeenCalledTimes(1);

    await loginPurchases('u1');
    expect(Purchases.logIn).toHaveBeenCalledWith('u1');
  });

  it('never throws when RevenueCat fails', async () => {
    Purchases.configure.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(loginPurchases('u1')).resolves.toBe(false);
    Purchases.logOut.mockRejectedValueOnce(new Error('anonymous'));
    await loginPurchases('u1');
    await expect(logoutPurchases()).resolves.toBeUndefined();
  });
});

describe('store calls', () => {
  it('refuse to run before the account is identified', async () => {
    await expect(getOfferings()).rejects.toThrow('PURCHASES_UNAVAILABLE');
    await expect(purchasePackage({})).rejects.toThrow('PURCHASES_UNAVAILABLE');
  });

  it('shape the current offering for rendering and keep the raw package', async () => {
    await loginPurchases('u1');
    const raw = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'plus_monthly', priceString: '$4.99', price: 4.99, currencyCode: 'USD', subscriptionPeriod: 'P1M' } };
    Purchases.getOfferings.mockResolvedValueOnce({ current: { identifier: 'default', availablePackages: [raw] } });

    const offering = await getOfferings();

    expect(offering.packages[0]).toMatchObject({ packageType: 'MONTHLY', product: { priceString: '$4.99', subscriptionPeriod: 'P1M' }, raw });
  });

  it('returns null without a current offering', async () => {
    await loginPurchases('u1');
    Purchases.getOfferings.mockResolvedValueOnce({ current: null });
    await expect(getOfferings()).resolves.toBeNull();
  });

  it('treats cancelling as an outcome, not an error', async () => {
    await loginPurchases('u1');
    const raw = { identifier: 'p' };
    Purchases.purchasePackage.mockResolvedValueOnce({ customerInfo: {} });
    await expect(purchasePackage({ raw })).resolves.toEqual({ status: 'purchased' });
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(raw);

    Purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: true, code: '1' });
    await expect(purchasePackage({ raw })).resolves.toEqual({ status: 'cancelled' });

    Purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: false, code: '20' });
    await expect(purchasePackage({ raw })).resolves.toEqual({ status: 'pending' });

    Purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: false, code: '2', message: 'store problem' });
    await expect(purchasePackage({ raw })).rejects.toMatchObject({ message: 'store problem' });
  });

  it('restores', async () => {
    await loginPurchases('u1');
    await expect(restorePurchases()).resolves.toEqual({ status: 'restored' });
  });

  it('links to the store subscription page, preferring RevenueCat’s own link', async () => {
    expect(await getManagementUrl()).toMatch(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//);

    await loginPurchases('u1');
    Purchases.getCustomerInfo.mockResolvedValueOnce({ managementURL: 'https://example.test/manage' });
    expect(await getManagementUrl()).toBe('https://example.test/manage');
  });
});

describe('ordering (review fixes)', () => {
  it('the next account logs in only after the previous logout finished', async () => {
    await loginPurchases('A');
    let finishLogout;
    Purchases.logOut.mockImplementationOnce(() => new Promise((r) => { finishLogout = r; }));
    const order = [];
    Purchases.logIn.mockImplementationOnce(async (id) => { order.push(`logIn:${id}`); return {}; });

    const out = logoutPurchases();
    const inB = loginPurchases('B');
    await Promise.resolve();
    expect(Purchases.logIn).not.toHaveBeenCalled(); // still waiting for logOut

    order.push('logOut done');
    finishLogout({});
    await out;
    await expect(inB).resolves.toBe(true);
    expect(order).toEqual(['logOut done', 'logIn:B']);
  });

  it('ensurePurchases identifies the account or throws PURCHASES_UNAVAILABLE', async () => {
    await expect(ensurePurchases('u1')).resolves.toBeUndefined();
    Purchases.logIn.mockRejectedValueOnce(new Error('offline'));
    await expect(ensurePurchases('u2')).rejects.toMatchObject({ code: 'PURCHASES_UNAVAILABLE' });
  });
});

describe('trial eligibility and error kinds (review fixes)', () => {
  const offering = () => ({ current: { identifier: 'default', availablePackages: [
    { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'plus_annual', priceString: '$39.99', introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } },
  ] } });

  it('on iOS, shows a trial only to Apple IDs StoreKit says are eligible', async () => {
    const { Platform } = require('react-native');
    expect(Platform.OS).toBe('ios'); // jest-expo default
    await loginPurchases('u1');

    Purchases.getOfferings.mockResolvedValueOnce(offering());
    Purchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValueOnce({ plus_annual: { status: 1 } }); // ineligible
    expect((await getOfferings()).packages[0].product.introPrice).toBeNull();

    Purchases.getOfferings.mockResolvedValueOnce(offering());
    Purchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValueOnce({ plus_annual: { status: 2 } }); // eligible
    expect((await getOfferings()).packages[0].product.introPrice).not.toBeNull();

    Purchases.getOfferings.mockResolvedValueOnce(offering());
    Purchases.checkTrialOrIntroductoryPriceEligibility.mockRejectedValueOnce(new Error('storekit'));
    expect((await getOfferings()).packages[0].product.introPrice).toBeNull(); // unknown means no promise
  });

  it('classifies purchase failures', () => {
    expect(purchaseErrorKind({ code: '6' })).toBe('already_owned');
    expect(purchaseErrorKind({ code: '7' })).toBe('already_owned');
    expect(purchaseErrorKind({ code: '10' })).toBe('network');
    expect(purchaseErrorKind({ code: 'PURCHASES_UNAVAILABLE' })).toBe('unavailable');
    expect(purchaseErrorKind({ code: '2' })).toBe('other');
    expect(purchasesStatus()).toBe('ready');
  });
});
