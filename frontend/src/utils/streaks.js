// Pure medication-streak helpers, unit-tested like utils/weight.js.
//
// A streak is only meaningful for genuinely-daily behavior, so it exists ONLY
// for medications with active === true and frequency === 'daily' — pets
// without daily meds never see one (honest-gamification rule: reward real
// care cadence, never manufactured engagement).
//
// Phase 1 computes from a locally-persisted list of dose days (the API exposes
// only last_administered_at, not the log history). The math is source-agnostic
// so the Phase 2 server-side summary can drive the same functions.

// Local-calendar day key ('YYYY-MM-DD') — doses are a "did it today" concept,
// so we bucket by the device's local date, not UTC.
export const dayKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// Append a dose day to a history list — deduped, sorted, capped to a year so
// AsyncStorage never grows unbounded. Returns a new array.
export const addDoseDay = (days = [], date = new Date()) => {
  const key = dayKey(date);
  if (!key) return days;
  return [...new Set([...days, key])].sort().slice(-366);
};

/**
 * Compute the daily-dose streak for one medication.
 *
 * @param {string[]} doseDays  'YYYY-MM-DD' keys (any order, dupes ok)
 * @param {object}   medication  needs { active, frequency }
 * @param {Date}     today  injectable for tests
 * @returns {null | { current, longest, coveredToday }}
 *   null when a streak doesn't apply (not an active daily med, or no doses).
 *   `current` counts consecutive days ending today — or ending yesterday when
 *   today's dose just hasn't happened yet (the streak is alive until midnight,
 *   not broken at breakfast). A gap of 2+ days resets current to 0; `longest`
 *   is kept so the recovery copy can acknowledge history without shaming.
 */
export const medicationStreak = (doseDays, medication, today = new Date()) => {
  if (!medication?.active || medication?.frequency !== 'daily') return null;
  const days = [...new Set(doseDays || [])].filter(Boolean).sort();
  if (!days.length) return null;

  // Walk the unique days once, tracking run lengths. Day arithmetic uses UTC
  // from the calendar components — local-midnight epoch diffs are 23h/25h
  // across DST/clock changes (e.g. Casablanca Feb 15→16 2026 is 25h), which
  // would silently break a streak twice a year.
  const MS_DAY = 86400000;
  const at = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = at(days[i]) - at(days[i - 1]) === MS_DAY ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const todayKey = dayKey(today);
  // Calendar decrement (setDate), not minus-24h — same DST hazard as above.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const last = days[days.length - 1];
  const coveredToday = last === todayKey;
  // `run` currently holds the length of the trailing run.
  const current = coveredToday || last === yesterdayKey ? run : 0;

  return { current, longest, coveredToday };
};

// Chip copy — recovery-framed, never shame. Returns null when nothing should
// render (non-daily meds, or a 0-day streak with no history worth mentioning).
export const medicationStreakLabel = (streak) => {
  if (!streak) return null;
  if (streak.current >= 2) return `${streak.current}-day streak`;
  if (streak.current === 1) return streak.coveredToday ? 'Streak started' : 'Dose logged yesterday';
  if (streak.longest >= 2) return 'Pick up where you left off';
  return null;
};
