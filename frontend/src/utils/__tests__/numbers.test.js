import i18n from '../../i18n';
import { formatDecimal, parseDecimal } from '../numbers';
import { buildExtractionPayload, extractionCount } from '../extraction';

describe('parseDecimal', () => {
  it('reads a comma or a dot as the decimal mark', () => {
    expect(parseDecimal('22,5')).toBe(22.5);
    expect(parseDecimal('22.5')).toBe(22.5);
    expect(parseDecimal(' 4,80 ')).toBe(4.8);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('12')).toBe(12);
  });

  it('reads the leading number like parseFloat', () => {
    expect(parseDecimal('22,5 kg')).toBe(22.5);
    expect(parseDecimal('-1.5')).toBe(-1.5);
  });

  it('is NaN without a number, and passes numbers through', () => {
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('kg')).toBeNaN();
    expect(parseDecimal(null)).toBeNaN();
    expect(parseDecimal(undefined)).toBeNaN();
    expect(parseDecimal(3.25)).toBe(3.25);
  });
});

describe('formatDecimal', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('prints exactly what toFixed printed in English', () => {
    expect(formatDecimal(12.5, 1)).toBe('12.5');
    expect(formatDecimal(12, 1)).toBe('12.0');
    expect(formatDecimal(1234.5, 2)).toBe('1234.50'); // no grouping
    expect(formatDecimal(12, { min: 0, max: 1 })).toBe('12');
    expect(formatDecimal(0.25, { min: 0, max: 1 })).toBe('0.3');
  });

  it.each(['fr', 'es'])('prints a decimal comma in %s', async (lng) => {
    await i18n.changeLanguage(lng);
    expect(formatDecimal(12.5, 1)).toBe('12,5');
    expect(formatDecimal(45, 2)).toBe('45,00');
    expect(formatDecimal(1234.5, 2)).toBe('1234,50');
    expect(formatDecimal(0.5, { min: 0, max: 1 })).toBe('0,5');
  });

  it('is empty for anything that is not a number', () => {
    expect(formatDecimal(null, 1)).toBe('');
    expect(formatDecimal('abc', 1)).toBe('');
    expect(formatDecimal(NaN, 1)).toBe('');
  });

  it('formats a numeric string', () => {
    expect(formatDecimal('4.8', { min: 0, max: 2 })).toBe('4.8');
  });
});

// A French keypad types '22,5': the extraction review must keep the .5.
describe('extraction with a decimal comma', () => {
  const sel = (weight, amount) => ({
    setTitle: 'Visit', setCategory: 'lab', vaccinations: [], medications: [],
    weight: { included: true, value: weight, unit: 'kg', date: '2026-10-01' },
    expense: { included: true, amount, date: '' },
    clinic: null,
  });

  it('sends 22.5 and 45.9 for "22,5" and "45,90"', () => {
    const payload = buildExtractionPayload(sel('22,5', '45,90'));
    expect(payload.weight.value).toBe(22.5);
    expect(payload.expense.amount).toBe(45.9);
    expect(extractionCount(sel('22,5', '45,90'))).toBe(2);
  });

  it('still drops zero or empty values', () => {
    expect(extractionCount(sel('0,0', ''))).toBe(0);
  });
});

// The weight trend's amount and percent follow the app language too.
describe('weight trend numbers', () => {
  const { weightInsight } = require('../weight');
  const pt = (value, loggedAt) => ({ value, loggedAt });
  afterEach(() => i18n.changeLanguage('en'));

  it('prints "4,3 %" in French', async () => {
    await i18n.changeLanguage('fr');
    const s = weightInsight([pt(4.6, '2026-08-16'), pt(4.8, '2026-10-16')], 'kg').summary;
    expect(s).toMatch(/0,2\u00a0kg \(4,3\u00a0%\)/);
  });

  it('keeps "4.3%" in English', () => {
    const s = weightInsight([pt(4.6, '2026-08-16'), pt(4.8, '2026-10-16')], 'kg').summary;
    expect(s).toContain('0.2 kg (4.3%)');
  });
});
