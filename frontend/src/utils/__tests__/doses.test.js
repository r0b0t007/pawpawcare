import { dosesPerDay, dosesOn, dosesTakenOn, addDoseCount, mergeDoseHistory } from '../doses';

const TODAY = '2026-10-12';
const BID = { id: 'm1', times: ['08:00', '20:00'] };

describe('dosesPerDay', () => {
  it('expects one dose per scheduled time, at least one', () => {
    expect(dosesPerDay(BID)).toBe(2);
    expect(dosesPerDay({ id: 'm2', times: ['08:00'] })).toBe(1);
    expect(dosesPerDay({ id: 'm3', times: [] })).toBe(1);
    expect(dosesPerDay({ id: 'm4' })).toBe(1);
  });
});

describe('dosesOn', () => {
  it('reads the per-day count', () => {
    expect(dosesOn(BID, { doseCounts: { m1: { [TODAY]: 1 } } }, TODAY)).toBe(1);
  });

  it('counts a recorded dose day as at least one (older or other-device doses)', () => {
    expect(dosesOn(BID, { doseDays: { m1: [TODAY] } }, TODAY)).toBe(1);
    expect(dosesOn(BID, { doseDays: { m1: ['2026-10-11'] } }, TODAY)).toBe(0);
  });

  it('is zero with no history at all', () => {
    expect(dosesOn(BID, {}, TODAY)).toBe(0);
  });
});

describe('addDoseCount', () => {
  it('counts doses per local day without touching other meds', () => {
    const at = new Date('2026-10-12T08:05:00');
    let counts = addDoseCount({ m9: { [TODAY]: 3 } }, 'm1', at);
    counts = addDoseCount(counts, 'm1', new Date('2026-10-12T20:10:00'));
    expect(counts.m1[TODAY]).toBe(2);
    expect(counts.m9[TODAY]).toBe(3);
  });

  it('keeps only the most recent week of days', () => {
    let counts = {};
    for (let d = 1; d <= 10; d++) counts = addDoseCount(counts, 'm1', new Date(2026, 9, d, 9));
    expect(Object.keys(counts.m1)).toHaveLength(7);
    expect(counts.m1['2026-10-01']).toBeUndefined();
    expect(counts.m1['2026-10-10']).toBe(1);
  });
});

describe('dosesTakenOn', () => {
  it('caps at the doses a med expects', () => {
    const once = { id: 'm5', times: ['08:00'] };
    expect(dosesTakenOn(once, { doseCounts: { m5: { [TODAY]: 3 } } }, TODAY)).toBe(1);
    expect(dosesTakenOn(BID, { doseCounts: { m1: { [TODAY]: 1 } } }, TODAY)).toBe(1);
  });
});

describe('mergeDoseHistory', () => {
  it('keeps a dose that is in memory but not yet persisted', () => {
    const stored = { doseDays: { m1: ['2026-10-11'] }, doseCounts: { m1: { [TODAY]: 1 } } };
    const current = { doseDays: { m1: [TODAY] }, doseCounts: { m1: { [TODAY]: 2 } } };
    const merged = mergeDoseHistory(stored, current, ['m1']);
    expect(merged.doseDays.m1).toEqual(['2026-10-11', TODAY]);
    expect(merged.doseCounts.m1[TODAY]).toBe(2);
  });

  it('prunes meds that no longer exist', () => {
    const merged = mergeDoseHistory({ doseDays: { gone: [TODAY] }, doseCounts: {} }, {}, ['m1']);
    expect(merged.doseDays).toEqual({});
    expect(merged.doseCounts).toEqual({});
  });
});
