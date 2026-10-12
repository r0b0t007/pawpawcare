import { dayKey } from './streaks';

// Daily-med dose counting for the Today cards. A daily med is "done" only
// when every scheduled time has a dose — a twice-daily med is half done after
// breakfast, not finished. Pure functions, unit-tested.

// Doses a daily med expects per day: one per scheduled time (at least one).
export const dosesPerDay = (med) => Math.max(1, (med?.times || []).length);

// Doses logged for `med` on day `key`. Counts are device-local; the dose-day
// history (which also carries other devices' last_administered_at) guarantees
// at least one when that day is recorded there.
export const dosesOn = (med, { doseCounts, doseDays } = {}, key) =>
  Math.max(
    doseCounts?.[med.id]?.[key] || 0,
    (doseDays?.[med.id] || []).includes(key) ? 1 : 0,
  );

// Days of per-day counts kept per med — only "today" is ever read, the rest
// is slack for timezone edges.
const KEEP_DAYS = 7;

// One more dose for `medId` on the local day of `date`. Returns a new map,
// pruned to the most recent KEEP_DAYS days so storage never grows.
export const addDoseCount = (counts = {}, medId, date = new Date()) => {
  const key = dayKey(date);
  if (!key) return counts;
  const days = { ...(counts[medId] || {}), [key]: ((counts[medId] || {})[key] || 0) + 1 };
  const kept = Object.keys(days).sort().slice(-KEEP_DAYS);
  return { ...counts, [medId]: Object.fromEntries(kept.map((k) => [k, days[k]])) };
};

// Doses taken on day `key`, capped at what the med expects — what a Today
// card counts toward its progress.
export const dosesTakenOn = (med, history, key) => Math.min(dosesPerDay(med), dosesOn(med, history, key));

// Combine stored dose history with what's already in memory, keeping the
// larger of each (a dose logged moments before a refresh may not have been
// persisted yet). Only meds in `medIds` survive, so deleted meds are pruned.
export const mergeDoseHistory = (stored, current, medIds) => {
  const doseDays = {};
  const doseCounts = {};
  for (const id of medIds) {
    const days = [...new Set([...(stored.doseDays?.[id] || []), ...(current.doseDays?.[id] || [])])]
      .sort()
      .slice(-366);
    if (days.length) doseDays[id] = days;
    const counts = { ...(stored.doseCounts?.[id] || {}) };
    for (const [day, n] of Object.entries(current.doseCounts?.[id] || {})) {
      counts[day] = Math.max(counts[day] || 0, n);
    }
    if (Object.keys(counts).length) doseCounts[id] = counts;
  }
  return { doseDays, doseCounts };
};
