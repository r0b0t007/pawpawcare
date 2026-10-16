// How a reminder's schedule reads in the app language — shared by the
// Reminders list and the Health hub, unit-tested in en, fr and es.
import i18n from '../i18n';
import { fmtTime, parseHHmm } from './dates';

// The server's recurrence enum. Anything else reads as a generic "repeats"
// wording: a raw enum value must never reach translated text.
const RECURRENCES = ['daily', 'weekly', 'monthly'];

const recurrenceKey = (r) => {
  const rec = r.recurrence || 'daily';
  return RECURRENCES.includes(rec) ? rec : 'other';
};

/**
 * "Weekly at 9:00 AM" / "Cada semana a las 9:00". The time follows the app
 * language, and reminders.atTime is a plural keyed on the hour, so Spanish
 * says "a la 1:30" but "a las 9:30". An unparseable time is shown as stored.
 */
export const recurringSummary = (r) => {
  const raw = r.time_of_day || '09:00';
  const parsed = parseHHmm(raw);
  const at = i18n.t('reminders.atTime', { time: fmtTime(raw) || raw, count: parsed ? parsed.h : 0 });
  return i18n.t(`reminders.schedule.${recurrenceKey(r)}`, { at });
};

/** "Weekly reminder" for a recurring reminder, "Reminder" for a one-off. */
export const reminderKind = (r) =>
  r.schedule_type === 'recurring'
    ? i18n.t(`health.reminderKind.${recurrenceKey(r)}`)
    : i18n.t('health.reminderKind.once');
