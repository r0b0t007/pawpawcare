import { dayKey, addDoseDay, medicationStreak, medicationStreakLabel } from '../streaks';

const DAILY = { active: true, frequency: 'daily' };
// Fixed "today" for determinism (local time).
const TODAY = new Date('2026-08-22T10:00:00');

const daysEndingToday = (n) => {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKey(new Date(TODAY.getTime() - i * 86400000)));
  }
  return out;
};

describe('dayKey', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-08-05T10:00:00'))).toBe('2026-08-05');
  });
  it('returns null for invalid dates', () => {
    expect(dayKey('not a date')).toBeNull();
  });
});

describe('addDoseDay', () => {
  it('appends, dedupes and sorts', () => {
    const days = addDoseDay(['2026-08-20'], new Date('2026-08-19T09:00:00'));
    expect(days).toEqual(['2026-08-19', '2026-08-20']);
    expect(addDoseDay(days, new Date('2026-08-20T22:00:00'))).toEqual(days);
  });
  it('caps history at 366 days', () => {
    const many = Array.from({ length: 400 }, (_, i) => dayKey(new Date(2025, 0, 1 + i)));
    expect(addDoseDay(many, new Date(2026, 5, 1)).length).toBe(366);
  });
});

describe('medicationStreak', () => {
  it('is null for non-daily or inactive meds (streaks only where behavior is daily)', () => {
    const days = daysEndingToday(5);
    expect(medicationStreak(days, { active: true, frequency: 'as_needed' }, TODAY)).toBeNull();
    expect(medicationStreak(days, { active: false, frequency: 'daily' }, TODAY)).toBeNull();
    expect(medicationStreak(days, null, TODAY)).toBeNull();
  });

  it('is null with no dose history', () => {
    expect(medicationStreak([], DAILY, TODAY)).toBeNull();
  });

  it('counts consecutive days ending today', () => {
    expect(medicationStreak(daysEndingToday(4), DAILY, TODAY)).toEqual({
      current: 4,
      longest: 4,
      coveredToday: true,
    });
  });

  it('stays alive (not broken at breakfast) when today is not yet logged', () => {
    const days = daysEndingToday(4).slice(0, 3); // ends yesterday
    expect(medicationStreak(days, DAILY, TODAY)).toEqual({
      current: 3,
      longest: 3,
      coveredToday: false,
    });
  });

  it('resets current after a 2+ day gap but keeps longest', () => {
    const days = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
    const s = medicationStreak(days, DAILY, TODAY); // last dose a week ago
    expect(s).toEqual({ current: 0, longest: 5, coveredToday: false });
  });

  it('tolerates multiple doses per day (deduped by day)', () => {
    const days = [...daysEndingToday(3), dayKey(TODAY), dayKey(TODAY)];
    expect(medicationStreak(days, DAILY, TODAY).current).toBe(3);
  });

  it('handles a gap in the middle: trailing run is the current streak', () => {
    const days = ['2026-08-01', '2026-08-02', ...daysEndingToday(2)];
    expect(medicationStreak(days, DAILY, TODAY)).toEqual({
      current: 2,
      longest: 2,
      coveredToday: true,
    });
  });

  it('survives DST/clock changes: consecutive calendar days count even when 23h/25h apart', () => {
    // Casablanca 2026: Feb 15→16 is a 25h day, Mar 22→23 is 23h (verified on
    // the host TZ); US zones flip Mar 8 / Nov 1. Calendar-day arithmetic must
    // treat all of these as consecutive.
    const springForward = ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'];
    const s1 = medicationStreak(springForward, DAILY, new Date('2026-03-10T10:00:00'));
    expect(s1).toEqual({ current: 4, longest: 4, coveredToday: true });

    const clockChange = ['2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17'];
    const s2 = medicationStreak(clockChange, DAILY, new Date('2026-02-17T09:00:00'));
    expect(s2).toEqual({ current: 4, longest: 4, coveredToday: true });

    // "Alive until midnight" across a transition: last dose was the calendar
    // day before `today`, even though the epoch gap isn't exactly 24h.
    const s3 = medicationStreak(['2026-02-14', '2026-02-15'], DAILY, new Date('2026-02-16T00:30:00'));
    expect(s3).toEqual({ current: 2, longest: 2, coveredToday: false });
  });
});

describe('medicationStreakLabel', () => {
  it('is null when there is no streak object', () => {
    expect(medicationStreakLabel(null)).toBeNull();
  });
  it('names an active streak', () => {
    expect(medicationStreakLabel({ current: 6, longest: 6, coveredToday: true })).toBe('6-day streak');
  });
  it('marks a fresh start', () => {
    expect(medicationStreakLabel({ current: 1, longest: 1, coveredToday: true })).toBe('Streak started');
    expect(medicationStreakLabel({ current: 1, longest: 3, coveredToday: false })).toBe('Dose logged yesterday');
  });
  it('uses recovery framing after a break — never shame', () => {
    expect(medicationStreakLabel({ current: 0, longest: 5, coveredToday: false })).toBe('Pick up where you left off');
  });
  it('renders nothing for 0-current with no meaningful history', () => {
    expect(medicationStreakLabel({ current: 0, longest: 1, coveredToday: false })).toBeNull();
  });
});
