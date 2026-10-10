import { annualSavings, formatPeriod, introOfferText, planStatus, priceWithPeriod, storeName } from '../subscription';
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
