// Shared plain-language date/time formatting, so Home, Health and the pet
// profile word dates and times the same way. Pure functions, unit-tested.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const isValid = (date) => date instanceof Date && !Number.isNaN(date.getTime());

// 'Oct 14' — '—' rather than "Invalid Date" if a malformed date slips through.
export const fmtShort = (date) =>
  isValid(date) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

// '08:00' / '18:30' -> '8:00 AM' / '6:30 PM'. Null for anything unparseable,
// so callers decide the fallback.
export const fmtTime = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!match) return null;
  const h = Number(match[1]);
  if (h > 23) return null;
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Whole local days from `today` to `date` (negative = past).
export const dayDiff = (date, today = new Date()) =>
  Math.round((startOfDay(date) - startOfDay(today)) / DAY_MS);

// "today" / "tomorrow" / "in 8 days" / "in 3 weeks" / "on 3 Dec": relative
// first; the exact date lives in the row's secondary line.
export const relativeDay = (date, today = new Date()) => {
  if (!isValid(date)) return '—';
  const n = dayDiff(date, today);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  if (n < 56) return `in ${Math.round(n / 7)} weeks`;
  return `on ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};
