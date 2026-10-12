import {
  fmtShort, fmtDay, fmtTime, fmtFull, fmtMonth, fmtClock, fmtDayTime, dayDiff, relativeDay, timeAgo, daysOverdue, overdueLabel, parseDay,
} from '../dates';

// Fixed "today" for determinism (local time).
const TODAY = new Date('2026-10-12T10:00:00');
const plus = (days, hour = 9) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

describe('fmtTime', () => {
  it('formats 24h times as one consistent 12h style', () => {
    expect(fmtTime('08:00')).toBe('8:00 AM');
    expect(fmtTime('18:30')).toBe('6:30 PM');
    expect(fmtTime('00:05')).toBe('12:05 AM');
    expect(fmtTime('12:00')).toBe('12:00 PM');
  });

  it('returns null for anything unparseable', () => {
    expect(fmtTime(null)).toBeNull();
    expect(fmtTime('')).toBeNull();
    expect(fmtTime('soon')).toBeNull();
    expect(fmtTime('25:00')).toBeNull();
  });
});

describe('fmtShort', () => {
  it('never renders "Invalid Date"', () => {
    expect(fmtShort(new Date('nope'))).toBe('—');
    expect(fmtShort(new Date('2026-10-14T12:00:00'))).toBe('Oct 14');
  });
});

describe('dayDiff / relativeDay', () => {
  it('counts whole local days regardless of time of day', () => {
    expect(dayDiff(plus(0, 23), TODAY)).toBe(0);
    expect(dayDiff(plus(1, 0), TODAY)).toBe(1);
    expect(dayDiff(plus(-2), TODAY)).toBe(-2);
  });

  it('words dates relative to today', () => {
    expect(relativeDay(plus(-3), TODAY)).toBe('3 days ago');
    expect(relativeDay(plus(-1), TODAY)).toBe('yesterday');
    expect(relativeDay(plus(0), TODAY)).toBe('today');
    expect(relativeDay(plus(1), TODAY)).toBe('tomorrow');
    expect(relativeDay(plus(8), TODAY)).toBe('in 8 days');
    expect(relativeDay(plus(21), TODAY)).toBe('in 3 weeks');
    expect(relativeDay(new Date('2026-12-25T12:00:00'), TODAY)).toBe('on 25 Dec');
    expect(relativeDay(new Date('nope'), TODAY)).toBe('—');
  });
});

describe('fmtDay', () => {
  it('reads as a plain-language day', () => {
    expect(fmtDay(new Date('2026-10-10T12:00:00'))).toBe('Sat 10 Oct');
    expect(fmtDay(new Date('nope'))).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-12T10:00:00Z').getTime();
  it('never says 0m ago, and steps up to hours and days', () => {
    expect(timeAgo('2026-10-12T09:59:50Z', now)).toBe('1m ago');
    expect(timeAgo('2026-10-12T09:45:00Z', now)).toBe('15m ago');
    expect(timeAgo('2026-10-12T07:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-10-10T10:00:00Z', now)).toBe('2d ago');
    expect(timeAgo(null, now)).toBe('');
  });
});

describe('daysOverdue / overdueLabel', () => {
  it('counts calendar days past due, the same all day long', () => {
    const morning = new Date('2026-10-12T09:00:00');
    const evening = new Date('2026-10-12T21:00:00');
    expect(daysOverdue('2026-10-10', morning)).toBe(2);
    expect(daysOverdue('2026-10-10', evening)).toBe(2);
    expect(daysOverdue('2026-10-11', morning)).toBe(1);
    expect(daysOverdue('2026-10-12', morning)).toBe(1); // due today: at least one
    expect(overdueLabel('2026-10-11', morning)).toBe('Overdue · 1 day');
    expect(overdueLabel('2026-10-02', evening)).toBe('Overdue · 10 days');
  });
});

describe('parseDay / fmtFull / fmtMonth', () => {
  it('parses calendar dates (or the date part of a timestamp) at local noon', () => {
    expect(parseDay('2026-10-05').getDate()).toBe(5);
    expect(parseDay('2026-10-05T23:30:00Z').getDate()).toBe(5);
    expect(Number.isNaN(parseDay(null).getTime())).toBe(true);
    expect(fmtFull(parseDay('2026-10-05'))).toBe('Oct 5, 2026');
    expect(fmtMonth(parseDay('2026-10-05'))).toBe('OCT');
    expect(fmtMonth(parseDay(''))).toBe('');
  });
});

describe('fmtClock / fmtDayTime', () => {
  const today = new Date('2026-10-12T23:30:00');
  it('names the day so a time is never ambiguous', () => {
    expect(fmtClock(new Date('2026-10-12T09:05:00'))).toBe('9:05 AM');
    expect(fmtDayTime(new Date('2026-10-12T21:00:00'), today)).toBe('today 9:00 PM');
    expect(fmtDayTime(new Date('2026-10-13T00:30:00'), today)).toBe('tomorrow 12:30 AM');
    expect(fmtDayTime(new Date('2026-10-11T18:00:00'), today)).toBe('yesterday 6:00 PM');
    expect(fmtDayTime(new Date('2026-10-15T09:00:00'), today)).toBe('Thu 9:00 AM');
    expect(fmtDayTime(new Date('2026-11-02T09:00:00'), today)).toBe('Mon 2 Nov 9:00 AM');
    expect(fmtDayTime(new Date('nope'), today)).toBe('');
  });
});
