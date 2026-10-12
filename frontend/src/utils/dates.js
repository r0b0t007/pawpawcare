// Shared plain-language date/time formatting, so Home, Health and the pet
// profile word dates and times the same way. Pure functions, unit-tested.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const isValid = (date) => date instanceof Date && !Number.isNaN(date.getTime());

// A calendar date ('YYYY-MM-DD', or the date part of a timestamp) as a local
// Date at noon — noon so no timezone offset can tip it into the day before or
// after. The one parser for due dates, birthdays and log dates.
export const parseDay = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : new Date(NaN));

// 'Oct 14' — '—' rather than "Invalid Date" if a malformed date slips through.
export const fmtShort = (date) =>
  isValid(date) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

// 'Oct 14, 2026' — when the year matters (birthdays, logs).
export const fmtFull = (date) =>
  isValid(date) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// 'OCT' — chart axis labels.
export const fmtMonth = (date) =>
  isValid(date) ? date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';

// 'Fri 10 Oct' — plain-language day, never an ISO date.
export const fmtDay = (date) =>
  isValid(date) ? `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}` : '—';

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

// Calendar days a 'YYYY-MM-DD' due date is past, at least 1 — for "Overdue ·
// N days". Calendar days, not elapsed hours: due Oct 10 reads "2 days" all of
// Oct 12, morning and evening alike.
export const daysOverdue = (dueDate, today = new Date()) => Math.max(1, -dayDiff(parseDay(dueDate), today));

// "Overdue · 1 day" / "Overdue · 3 days".
export const overdueLabel = (dueDate, today = new Date()) => {
  const d = daysOverdue(dueDate, today);
  return `Overdue · ${d} day${d === 1 ? '' : 's'}`;
};

// "yesterday" / "today" / "tomorrow" / "in 8 days" / "in 3 weeks" / "on 3 Dec":
// relative first; the exact date lives in the row's secondary line. Past
// dates say so — never "today" for something that already happened.
export const relativeDay = (date, today = new Date()) => {
  if (!isValid(date)) return '—';
  const n = dayDiff(date, today);
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n} days ago`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  if (n < 56) return `in ${Math.round(n / 7)} weeks`;
  return `on ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

// '5m ago' / '3h ago' / '2d ago' for posts, comments and board reports
// (never '0m ago').
export const timeAgo = (iso, now = Date.now()) => {
  if (!iso) return '';
  const diff = (now - new Date(iso)) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
