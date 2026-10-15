import i18n from '../../i18n';
import {
  fmtShort, fmtDay, fmtTime, fmtFull, fmtMonth, fmtClock, fmtDayTime, fmtDate, fmtWeekday, dayDiff, relativeDay, timeAgo, daysOverdue,
  overdueLabel, parseDay,
} from '../dates';

// The English cases below run in 'en' (jest-setup pins the device locale) and
// assert the exact strings the app showed before i18n.

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

describe('fmtDate / fmtWeekday', () => {
  it('formats any Intl options in the app language, empty when invalid', () => {
    const d = new Date('2026-10-13T09:00:00');
    expect(fmtWeekday(d)).toBe('Tue');
    expect(fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })).toBe('Tue, Oct 13');
    expect(fmtDate(new Date('nope'), { month: 'short' })).toBe('');
  });
});

// Intl owns month and weekday spellings (they can vary a little between ICU
// versions), so those are compared with Intl itself; the words around them
// are the app's own translations and are asserted exactly.
describe.each([
  ['fr', 'fr-FR', {
    relative: ['il y a 3 jours', 'hier', "aujourd'hui", 'demain', 'dans 8 jours', 'dans 3 semaines'],
    on: (day, month) => `le ${day} ${month}`,
    ago: ['il y a 1 min', 'il y a 15 min', 'il y a 3 h', 'il y a 2 j'],
    overdue: ['En retard · 1 jour', 'En retard · 10 jours'],
    today: (time) => `aujourd'hui à ${time}`,
    yesterday: (time) => `hier à ${time}`,
  }],
  ['es', 'es-ES', {
    relative: ['hace 3 días', 'ayer', 'hoy', 'mañana', 'dentro de 8 días', 'dentro de 3 semanas'],
    on: (day, month) => `el ${day} de ${month}`,
    ago: ['hace 1 min', 'hace 15 min', 'hace 3 h', 'hace 2 d'],
    overdue: ['Atrasado · 1 día', 'Atrasado · 10 días'],
    today: (time) => `hoy, ${time}`,
    yesterday: (time) => `ayer, ${time}`,
  }],
])('in %s', (lng, tag, expected) => {
  const intl = (date, options) => new Intl.DateTimeFormat(tag, options).format(date);
  beforeAll(() => i18n.changeLanguage(lng));
  afterAll(() => i18n.changeLanguage('en'));

  it('words relative days in the language', () => {
    expect([plus(-3), plus(-1), plus(0), plus(1), plus(8), plus(21)].map((d) => relativeDay(d, TODAY)))
      .toEqual(expected.relative);
    const xmas = new Date('2026-12-25T12:00:00');
    expect(relativeDay(xmas, TODAY)).toBe(expected.on(25, intl(xmas, { month: 'short' })));
  });

  it('says how long ago, and how overdue', () => {
    const now = new Date('2026-10-12T10:00:00Z').getTime();
    expect(['2026-10-12T09:59:50Z', '2026-10-12T09:45:00Z', '2026-10-12T07:00:00Z', '2026-10-10T10:00:00Z']
      .map((iso) => timeAgo(iso, now))).toEqual(expected.ago);
    expect(overdueLabel('2026-10-11', new Date('2026-10-12T09:00:00'))).toBe(expected.overdue[0]);
    expect(overdueLabel('2026-10-02', new Date('2026-10-12T21:00:00'))).toBe(expected.overdue[1]);
  });

  it("formats dates and times with the language's Intl locale", () => {
    const day = new Date('2026-10-14T12:00:00');
    expect(fmtShort(day)).toBe(intl(day, { month: 'short', day: 'numeric' }));
    expect(fmtShort(day)).not.toBe('Oct 14');
    expect(fmtFull(day)).toBe(intl(day, { month: 'short', day: 'numeric', year: 'numeric' }));
    expect(fmtMonth(day)).toBe(intl(day, { month: 'short' }).toLocaleUpperCase(tag));
    expect(fmtDay(day)).toContain(intl(day, { weekday: 'short' }));
    // 24-hour clocks: never AM/PM.
    expect(fmtTime('18:30')).toBe('18:30');
    expect(fmtClock(new Date('2026-10-12T09:05:00'))).not.toMatch(/AM|PM/);
    const today = new Date('2026-10-12T23:30:00');
    const nine = new Date('2026-10-12T21:00:00');
    expect(fmtDayTime(nine, today)).toBe(expected.today(fmtClock(nine)));
    const six = new Date('2026-10-11T18:00:00');
    expect(fmtDayTime(six, today)).toBe(expected.yesterday(fmtClock(six)));
    expect(fmtDate(new Date('nope'), { month: 'short' })).toBe('');
    expect(fmtShort(new Date('nope'))).toBe('—');
  });
});
