import { dayDiff, parseDay } from './dates';

// Days ahead that an open record counts as "due soon".
export const DUE_SOON_DAYS = 30;

// A vaccination's status on `today`. Completed records keep their status; an
// open record only ever moves forward as days pass (upcoming → due_soon →
// overdue), mirroring the server's list-time flip (`due_date < today`): due
// *today* is due_soon, and only dates strictly before today are overdue — so
// nothing goes "overdue" at noon on its due day. The one rule used when data
// loads AND when the day rolls over while the app stays open.
export function vaxStatusOn(status, dueDate, today = new Date()) {
  if (status === 'completed' || !dueDate) return status;
  const due = parseDay(dueDate);
  if (Number.isNaN(due.getTime())) return status;
  const daysUntil = dayDiff(due, today);
  if (daysUntil < 0) return 'overdue';
  if (status === 'upcoming' && daysUntil <= DUE_SOON_DAYS) return 'due_soon';
  return status;
}
