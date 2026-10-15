// Shared plain-language date/time formatting, so Home, Health and the pet
// profile word dates and times the same way. Pure functions of their inputs
// and the app language, unit-tested in en, fr and es.
import i18n, { intlLocale } from '../i18n';

const t = (key, options) => i18n.t(key, options);

const DAY_MS = 86400000;

const isValid = (date) => date instanceof Date && !Number.isNaN(date.getTime());

// Formatting follows the app language (i18n/currentLocale): Intl.DateTimeFormat
// for the date parts, translated templates for the words around them. Hermes
// has Intl.DateTimeFormat but not Intl.RelativeTimeFormat, so relative phrases
// ('yesterday', 'in 3 weeks', '5m ago') are i18n strings, not Intl output.
// Formatters are cached per locale + options: building one is costly on Hermes.
const formatters = new Map();
const formatter = (options) => {
  const locale = intlLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
};

/** Any date in the app language with Intl options; '' if invalid. */
export const fmtDate = (date, options) => (isValid(date) ? formatter(options).format(date) : '');

const weekday = (date) => fmtDate(date, { weekday: 'short' });
const monthName = (date) => fmtDate(date, { month: 'short' });

// A calendar date ('YYYY-MM-DD', or the date part of a timestamp) as a local
// Date at noon — noon so no timezone offset can tip it into the day before or
// after. The one parser for due dates, birthdays and log dates.
export const parseDay = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : new Date(NaN));

// 'Oct 14' — '—' rather than "Invalid Date" if a malformed date slips through.
export const fmtShort = (date) => (isValid(date) ? fmtDate(date, { month: 'short', day: 'numeric' }) : '—');

// 'Oct 14, 2026' — when the year matters (birthdays, logs).
export const fmtFull = (date) =>
  isValid(date) ? fmtDate(date, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// 'OCT' — chart axis labels.
export const fmtMonth = (date) => monthName(date).toLocaleUpperCase(intlLocale());

// 'Fri 10 Oct' — plain-language day, never an ISO date.
export const fmtDay = (date) =>
  isValid(date) ? t('dates.dayMonth', { weekday: weekday(date), day: date.getDate(), month: monthName(date) }) : '—';

// '9:00 AM' — the clock time of a Date ('' if invalid).
export const fmtClock = (date) => fmtDate(date, { hour: 'numeric', minute: '2-digit' });

// 'Tue' — the short weekday name ('' if invalid).
export const fmtWeekday = weekday;

// '08:00' / '18:30' -> '8:00 AM' / '6:30 PM' (in English). Null for anything
// unparseable, so callers decide the fallback.
export const fmtTime = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return fmtClock(new Date(2000, 0, 1, h, m));
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
export const overdueLabel = (dueDate, today = new Date()) =>
  t('dates.overdue', { count: daysOverdue(dueDate, today) });

// "yesterday" / "today" / "tomorrow" / "in 8 days" / "in 3 weeks" / "on 3 Dec":
// relative first; the exact date lives in the row's secondary line. Past
// dates say so — never "today" for something that already happened.
export const relativeDay = (date, today = new Date()) => {
  if (!isValid(date)) return '—';
  const n = dayDiff(date, today);
  if (n === -1) return t('dates.yesterday');
  if (n < 0) return t('dates.daysAgo', { count: -n });
  if (n === 0) return t('dates.today');
  if (n === 1) return t('dates.tomorrow');
  if (n < 14) return t('dates.inDays', { count: n });
  if (n < 56) return t('dates.inWeeks', { count: Math.round(n / 7) });
  return t('dates.onDayMonth', { day: date.getDate(), month: monthName(date) });
};

// '5m ago' / '3h ago' / '2d ago' for posts, comments and board reports
// (never '0m ago').
export const timeAgo = (iso, now = Date.now()) => {
  if (!iso) return '';
  const diff = (now - new Date(iso)) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 3600) return t('dates.minutesAgoShort', { count: Math.max(1, Math.floor(diff / 60)) });
  if (diff < 86400) return t('dates.hoursAgoShort', { count: Math.floor(diff / 3600) });
  return t('dates.daysAgoShort', { count: Math.floor(diff / 86400) });
};

// 'today 9:00 AM' / 'tomorrow 12:30 AM' / 'yesterday 6:00 PM' / 'Mon 9:00 AM'
// (this week) / 'Fri 10 Oct 9:00 AM' — a moment in plain words, so a time is
// never ambiguous about which day it means.
export const fmtDayTime = (date, today = new Date()) => {
  if (!isValid(date)) return '';
  const n = dayDiff(date, today);
  const day = n === 0 ? t('dates.today')
    : n === 1 ? t('dates.tomorrow')
      : n === -1 ? t('dates.yesterday')
        : n > 1 && n < 7 ? weekday(date)
          : fmtDay(date);
  return t('dates.dayAtTime', { day, time: fmtClock(date) });
};
