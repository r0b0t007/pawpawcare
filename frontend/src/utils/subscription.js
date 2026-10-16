// Pure helpers for subscription copy: periods, savings, intro offers and the
// one status a plan shows. Kept free of React so they're easy to test.
//
// Every string is on i18n keys under `subscription.*` (CHW-188, CHW-191),
// read with i18n.t so callers get the current app language.
import { getLocales } from 'expo-localization';
import i18n, { currentLocale } from '../i18n';
import { fmtDate } from './dates';

const UNIT_KEYS = { D: 'day', W: 'week', M: 'month', Y: 'year' };
const RC_UNITS = { DAY: 'D', WEEK: 'W', MONTH: 'M', YEAR: 'Y' };

const parsePeriod = (iso) => {
  const m = /^P(\d+)([DWMY])$/.exec(iso || '');
  return m ? { n: Number(m[1]), unit: UNIT_KEYS[m[2]] } : null;
};

/** "3 months", "1 week": a count of units, always with the number. */
const duration = (n, unit) => i18n.t(`subscription.duration.${unit}`, { count: n });

/** "P1M" → "month", "P3M" → "3 months", "P1Y" → "year". null if unknown. */
export function formatPeriod(iso) {
  const p = parsePeriod(iso);
  if (!p) return null;
  return p.n === 1 ? i18n.t(`subscription.unit.${p.unit}`) : duration(p.n, p.unit);
}

/** "$4.99 / month" (or just the price when the period is unknown). */
export function priceWithPeriod(product) {
  const period = formatPeriod(product?.subscriptionPeriod);
  return period
    ? i18n.t('subscription.priceWithPeriod', { price: product.priceString, period })
    : product?.priceString ?? '';
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
  const period = unit ? formatPeriod(`P${units}${unit}`) : null;
  if (!period) return null;
  const word = UNIT_KEYS[unit];
  const price = intro.priceString;
  if (intro.price === 0) return i18n.t('subscription.intro.freeTrial', { duration: duration(units, word) });
  const cycles = intro.cycles || 1;
  if (cycles > 1) {
    const total = formatPeriod(`P${units * cycles}${unit}`);
    return i18n.t('subscription.intro.repeating', { price, period, total });
  }
  // "first month" / "first 3 months": its own key, since languages put the
  // ordinal and the count in different places.
  const span = i18n.t(`subscription.firstSpan.${word}`, { count: units });
  return i18n.t('subscription.intro.first', { price, span });
}

// Store ids → `subscription.store.*` keys ("the App Store").
const STORE_NAMES = { app_store: 'appStore', mac_app_store: 'appStore', play_store: 'playStore' };

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
  const message = (key) => i18n.t(`subscription.restoreOutcome.${key}`);
  if (result?.plan?.active) return { message: message('restored'), done: true };
  if (result?.synced === false) return { message: message('pending'), done: true };
  return { message: message('none'), done: false };
}

/** Where the subscription is billed, for copy ("the App Store"). */
export const storeName = (store) =>
  i18n.t(`subscription.store.${Object.prototype.hasOwnProperty.call(STORE_NAMES, store) ? STORE_NAMES[store] : 'unknown'}`);

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
