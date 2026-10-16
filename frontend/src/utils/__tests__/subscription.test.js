// The device's locale tag, switchable per test (the English renewal date
// keeps the device's English region).
let mockDeviceTag = 'en-US';
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockDeviceTag.slice(0, 2), languageTag: mockDeviceTag }],
}));

import i18n from '../../i18n';
import {
  annualSavings,
  formatPeriod,
  introOfferText,
  isFreeTrial,
  isRenewing,
  planStatus,
  planTitle,
  priceWithPeriod,
  restoreOutcome,
  storeName,
} from '../subscription';
import { isUpgradeRequired } from '../../services/api';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('periods and prices', () => {
  it('reads ISO 8601 periods', () => {
    expect(formatPeriod('P1M')).toBe('month');
    expect(formatPeriod('P1Y')).toBe('year');
    expect(formatPeriod('P3M')).toBe('3 months');
    expect(formatPeriod('P1W')).toBe('week');
    expect(formatPeriod(null)).toBeNull();
    expect(formatPeriod('weird')).toBeNull();
  });

  it('shows the price with its period', () => {
    expect(priceWithPeriod({ priceString: '$4.99', subscriptionPeriod: 'P1M' })).toBe('$4.99 / month');
    expect(priceWithPeriod({ priceString: '$49.99' })).toBe('$49.99');
  });

  it('computes the annual saving, ignoring tiny or impossible ones', () => {
    const monthly = { product: { price: 4.99 } };
    expect(annualSavings(monthly, { product: { price: 39.99 } })).toBe(33);
    expect(annualSavings(monthly, { product: { price: 58 } })).toBeNull(); // < 5%
    expect(annualSavings(null, { product: { price: 39.99 } })).toBeNull();
  });

  it('describes intro offers', () => {
    expect(introOfferText({ introPrice: { price: 0, priceString: '$0.00', periodUnit: 'WEEK', periodNumberOfUnits: 1 } })).toBe('Try 1 week free');
    expect(introOfferText({ introPrice: { price: 0, priceString: '$0.00', periodUnit: 'DAY', periodNumberOfUnits: 7 } })).toBe('Try 7 days free');
    expect(introOfferText({ introPrice: { price: 0.99, priceString: '$0.99', periodUnit: 'MONTH', periodNumberOfUnits: 1 } })).toBe('$0.99 for the first month');
    expect(introOfferText({ introPrice: null })).toBeNull();
  });
});

describe('planStatus — the one status a plan shows', () => {
  it('free plans have none', () => {
    expect(planStatus({ active: false })).toBeNull();
  });

  it('payment issues win over renewal, lifetime wins over everything', () => {
    expect(planStatus({ active: true, is_lifetime: true, billing_issue: true })).toEqual({ status: 'ok', label: 'Lifetime' });
    expect(planStatus({ active: true, billing_issue: true, will_renew: true })).toEqual({ status: 'overdue', label: 'Payment issue' });
  });

  it('renewing vs ending', () => {
    expect(planStatus({ active: true, will_renew: true, expires_at: '2026-12-01T00:00:00Z' })).toMatchObject({ status: 'ok', label: expect.stringMatching(/^Renews /) });
    expect(planStatus({ active: true, will_renew: false, expires_at: '2026-12-01T00:00:00Z' })).toMatchObject({ status: 'due', label: expect.stringMatching(/^Ends /) });
  });

  describe('dates and labels in the app language', () => {
    const renewing = { active: true, will_renew: true, expires_at: '2026-12-01T12:00:00Z' };
    const ending = { active: true, will_renew: false, expires_at: '2026-12-01T12:00:00Z' };
    afterEach(async () => {
      mockDeviceTag = 'en-US';
      await i18n.changeLanguage('en');
    });

    it("English keeps the device's English region for the date, as before i18n", () => {
      expect(planStatus(renewing).label).toBe('Renews Dec 1, 2026');
      mockDeviceTag = 'en-GB';
      expect(planStatus(renewing).label).toBe('Renews 1 Dec 2026');
      expect(planStatus(ending).label).toBe('Ends 1 Dec 2026');
      // A non-English device showing the English app: an English date.
      mockDeviceTag = 'de-DE';
      expect(planStatus(renewing).label).toBe('Renews Dec 1, 2026');
    });

    it('French and Spanish translate the whole label, date included', async () => {
      await i18n.changeLanguage('fr');
      expect(planStatus(renewing).label).toBe('Renouvellement le 1 déc. 2026');
      expect(planStatus(ending).label).toBe('Se termine le 1 déc. 2026');
      expect(planStatus({ active: true, is_lifetime: true }).label).toBe('À vie');
      expect(planTitle({ active: false }, false)).toBe('Offre gratuite');
      expect(planTitle({ active: true }, false)).toBe('PawPawCare Plus');

      await i18n.changeLanguage('es');
      expect(planStatus(renewing).label).toBe('Se renueva el 1 dic 2026');
      expect(planStatus({ active: true, billing_issue: true }).label).toBe('Problema con el pago');
      expect(planTitle({ active: false }, true)).toBe('Funciones Plus incluidas');
    });
  });

  it('names the billing store', () => {
    expect(storeName('play_store')).toBe('Google Play');
    expect(storeName('app_store')).toBe('the App Store');
    expect(storeName(null)).toBe('your app store');
  });
});

test('isUpgradeRequired recognises the server gate', () => {
  expect(isUpgradeRequired({ status: 402, code: 'upgrade_required' })).toBe(true);
  expect(isUpgradeRequired({ status: 402 })).toBe(false);
  expect(isUpgradeRequired({ status: 403, code: 'upgrade_required' })).toBe(false);
});

describe('review round 2', () => {
  it('describes repeating intro prices over their whole span', () => {
    expect(introOfferText({ introPrice: { price: 0.99, priceString: '$0.99', periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 3 } }))
      .toBe('$0.99 / month for 3 months');
    expect(introOfferText({ introPrice: { price: 1.99, priceString: '$1.99', periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } }))
      .toBe('$1.99 for the first week');
  });

  it('tells a free trial from a paid intro, and renewing from one-time', () => {
    expect(isFreeTrial({ introPrice: { price: 0 } })).toBe(true);
    expect(isFreeTrial({ introPrice: { price: 0.99 } })).toBe(false);
    expect(isFreeTrial({ introPrice: null })).toBe(false);
    expect(isRenewing({ subscriptionPeriod: 'P1M' })).toBe(true);
    expect(isRenewing({ subscriptionPeriod: null })).toBe(false);
  });

  it('shares plan titles and restore messages', () => {
    expect(planTitle({ active: true }, true)).toBe('PawPawCare Plus');
    expect(planTitle({ active: false }, true)).toBe('Plus features included');
    expect(planTitle({ active: false }, false)).toBe('Free plan');
    expect(restoreOutcome({ plan: { active: true } })).toEqual({ message: 'Purchases restored', done: true });
    expect(restoreOutcome({ synced: false, plan: null })).toEqual({ message: 'Restored — it may take a minute to show up', done: true });
    expect(restoreOutcome({ synced: true, plan: { active: false } })).toEqual({ message: 'No purchases found to restore', done: false });
  });
});

describe('paywall copy in French and Spanish', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('periods, intro offers, stores and restore messages', async () => {
    await i18n.changeLanguage('fr');
    expect(formatPeriod('P1M')).toBe('mois');
    expect(formatPeriod('P3M')).toBe('3 mois');
    expect(priceWithPeriod({ priceString: '4,99 €', subscriptionPeriod: 'P1Y' })).toBe('4,99 € / an');
    expect(introOfferText({ introPrice: { price: 0, priceString: '0,00 €', periodUnit: 'WEEK', periodNumberOfUnits: 1 } })).toBe('Essai gratuit de 1 semaine');
    expect(introOfferText({ introPrice: { price: 0.99, priceString: '0,99 €', periodUnit: 'MONTH', periodNumberOfUnits: 1 } })).toBe('0,99 € pour le 1er mois');
    expect(introOfferText({ introPrice: { price: 0.99, priceString: '0,99 €', periodUnit: 'MONTH', periodNumberOfUnits: 3 } })).toBe('0,99 € pour les 3 premiers mois');
    expect(storeName('app_store')).toBe("l'App Store");
    expect(restoreOutcome({ plan: { active: true } }).message).toBe('Achats restaurés');

    await i18n.changeLanguage('es');
    expect(introOfferText({ introPrice: { price: 0, priceString: '0,00 €', periodUnit: 'DAY', periodNumberOfUnits: 7 } })).toBe('Pruebe 7 días gratis');
    expect(introOfferText({ introPrice: { price: 1.99, priceString: '1,99 €', periodUnit: 'WEEK', periodNumberOfUnits: 1 } })).toBe('1,99 € durante la 1.ª semana');
    expect(storeName(null)).toBe('su tienda de aplicaciones');
  });

  it('English intro offers read exactly as before i18n', () => {
    expect(introOfferText({ introPrice: { price: 0.99, priceString: '$0.99', periodUnit: 'MONTH', periodNumberOfUnits: 3 } })).toBe('$0.99 for the first 3 months');
    expect(introOfferText({ introPrice: { price: 0, priceString: '$0.00', periodUnit: 'YEAR', periodNumberOfUnits: 1 } })).toBe('Try 1 year free');
    expect(storeName('mac_app_store')).toBe('the App Store');
    expect(storeName('constructor')).toBe('your app store');
  });
});
