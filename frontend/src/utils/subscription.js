// Pure helpers for subscription copy: periods, savings, intro offers and the
// one status a plan shows. Kept free of React so they're easy to test.

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

/** "Try 1 week free" / "$0.99 for the first month", or null. */
export function introOfferText(product) {
  const intro = product?.introPrice;
  if (!intro) return null;
  const unit = RC_UNITS[intro.periodUnit] ?? null;
  const span = unit ? formatPeriod(`P${intro.periodNumberOfUnits || 1}${unit}`) : null;
  if (!span) return null;
  const units = intro.periodNumberOfUnits || 1;
  const spanWithCount = units === 1 ? `1 ${span}` : span;
  return intro.price === 0 ? `Try ${spanWithCount} free` : `${intro.priceString} for the first ${span}`;
}

const STORE_NAMES = { app_store: 'the App Store', mac_app_store: 'the App Store', play_store: 'Google Play' };

/** Billed by Apple / Google (so managed and cancelled in their settings). */
export const isStoreBilled = (plan) =>
  !!(plan?.active && !plan.is_lifetime && Object.prototype.hasOwnProperty.call(STORE_NAMES, plan.store));

/** Store billing that keeps charging — e.g. after the account is deleted. */
export const isRenewingStoreSubscription = (plan) => isStoreBilled(plan) && !!plan.will_renew;

/** Where the subscription is billed, for copy ("the App Store"). */
export const storeName = (store) => STORE_NAMES[store] ?? 'your app store';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The single status a plan shows: { status: ok|due|overdue, label } for the
 * StatusPill, or null on the free plan.
 */
export function planStatus(plan) {
  if (!plan?.active) return null;
  if (plan.is_lifetime) return { status: 'ok', label: 'Lifetime' };
  if (plan.billing_issue) return { status: 'overdue', label: 'Payment issue' };
  const date = formatDate(plan.expires_at);
  if (plan.will_renew) return { status: 'ok', label: date ? `Renews ${date}` : 'Active' };
  return { status: 'due', label: date ? `Ends ${date}` : 'Ends soon' };
}
