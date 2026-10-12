import { fmtShort, fmtTime, dayDiff, relativeDay } from '../dates';

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
    expect(relativeDay(plus(-3), TODAY)).toBe('today');
    expect(relativeDay(plus(0), TODAY)).toBe('today');
    expect(relativeDay(plus(1), TODAY)).toBe('tomorrow');
    expect(relativeDay(plus(8), TODAY)).toBe('in 8 days');
    expect(relativeDay(plus(21), TODAY)).toBe('in 3 weeks');
    expect(relativeDay(new Date('2026-12-25T12:00:00'), TODAY)).toBe('on 25 Dec');
    expect(relativeDay(new Date('nope'), TODAY)).toBe('—');
  });
});
