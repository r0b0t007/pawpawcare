// Pure helpers for subscription copy: periods, savings, intro offers and the
// one status a plan shows. Kept free of React so they're easy to test.
//
// planTitle/planStatus are on i18n keys (`subscription.*`, CHW-188) because
// Profile shows them; the paywall copy below is still English until the
// paywall screens migrate.
import { getLocales } from 'expo-localization';
import i18n, { currentLocale } from '../i18n';
import { fmtDate } from './dates';

const UNIT_WORDS = { D: 'day', W: 'week', M: 'month', Y: 'year' };
const RC_UNITS = { DAY: 'D', WEEK: 'W', MONTH: 'M', YEAR: 'Y' };

/** "P1M" → "month", "P3M" → "3 months", "P1Y" → "year". null if unknown. */
export function formatPeriod(iso) {
  const m = /^P(\d+)([DWMY])$/.exec(iso || '');
  if (!m) return null;
  const n = Number(m[1]);
  const word = UNIT_WORDS[m[2]];
  return n === 1 ? word : `${n} ${word}s`;
}

/** "$4.99 / month" (or just the price when the period is unknown). */
export function priceWithPeriod(product) {
  const period = formatPeriod(product?.subscriptionPeriod);
  return period ? `${product.priceString} / ${period}` : product?.priceString ?? '';
}

/** Whole-percent saving of the annual plan over twelve months, or null. */
export function annualSavings(monthly, annual) {
  const m = monthly?.product?.price;
  const a = annual?.product?.price;
  if (!(m > 0) || !(a > 0)) return null;
  const pct = Math.round((1 - a / (m * 12)) * 100);
  return pct >= 5 ? pct : null; // not worth shouting about below 5%
}

/** Whether the product's (eligible) intro offer is a free trial — not a paid intro price. */
export const isFreeTrial = (product) => product?.introPrice?.price === 0;

/** Whether the product renews (has a subscription period) — vs a one-time purchase. */
export const isRenewing = (product) => formatPeriod(product?.subscriptionPeriod) !== null;

/**
 * "Try 1 week free", "$0.99 for the first month" or, for an intro price
 * that repeats, "$0.99 / month for 3 months". null without an intro offer.
 */
export function introOfferText(product) {
  const intro = product?.introPrice;
  if (!intro) return null;
  const unit = RC_UNITS[intro.periodUnit] ?? null;
  const units = intro.periodNumberOfUnits || 1;
  const span = unit ? formatPeriod(`P${units}${unit}`) : null;
  if (!span) return null;
  if (intro.price === 0) return `Try ${units === 1 ? `1 ${span}` : span} free`;
  const cycles = intro.cycles || 1;
  if (cycles > 1) {
    const total = formatPeriod(`P${units * cycles}${unit}`);
    return `${intro.priceString} / ${span} for ${total}`;
  }
  return `${intro.priceString} for the first ${span}`;
}

const STORE_NAMES = { app_store: 'the App Store', mac_app_store: 'the App Store', play_store: 'Google Play' };

/** Billed by Apple / Google (so managed and cancelled in their settings). */
export const isStoreBilled = (plan) =>
  !!(plan?.active && !plan.is_lifetime && Object.prototype.hasOwnProperty.call(STORE_NAMES, plan.store));

/** Store billing that keeps charging — e.g. after the account is deleted. */
export const isRenewingStoreSubscription = (plan) => isStoreBilled(plan) && !!plan.will_renew;

/** The plan's name for titles: Plus, included Plus features (early members), or free. */
export function planTitle(plan, included) {
  if (plan?.active) return i18n.t('subscription.plan.plus');
  return i18n.t(included ? 'subscription.plan.included' : 'subscription.plan.free');
}

/**
 * What to tell the user after a restore, and whether the job is done
 * (close the paywall). A restore the server couldn't confirm yet isn't
 * "nothing found".
 */
export function restoreOutcome(result) {
  if (result?.plan?.active) return { message: 'Purchases restored', done: true };
  if (result?.synced === false) return { message: 'Restored — it may take a minute to show up', done: true };
  return { message: 'No purchases found to restore', done: false };
}

/** Where the subscription is billed, for copy ("the App Store"). */
export const storeName = (store) => STORE_NAMES[store] ?? 'your app store';

// In English the renewal date keeps the device's English region, as it did
// before i18n ('1 Dec 2026' on en-GB, 'Dec 1, 2026' on en-US); a non-English
// device gets en-US rather than a date in a language the app isn't showing.
// French and Spanish use the app language (fr-FR, es-ES).
function englishTag() {
  try {
    const tag = getLocales()?.[0]?.languageTag;
    return tag && /^en(-|$)/i.test(tag) ? tag : 'en-US';
  } catch {
    return 'en-US';
  }
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const locale = currentLocale() === 'en' ? englishTag() : undefined;
  return fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
}

/**
 * The single status a plan shows: { status: ok|due|overdue, label } for the
 * StatusPill, or null on the free plan.
 */
export function planStatus(plan) {
  if (!plan?.active) return null;
  const t = (key, options) => i18n.t(`subscription.status.${key}`, options);
  if (plan.is_lifetime) return { status: 'ok', label: t('lifetime') };
  if (plan.billing_issue) return { status: 'overdue', label: t('paymentIssue') };
  const date = formatDate(plan.expires_at);
  if (plan.will_renew) return { status: 'ok', label: date ? t('renews', { date }) : t('active') };
  return { status: 'due', label: date ? t('ends', { date }) : t('endsSoon') };
}
