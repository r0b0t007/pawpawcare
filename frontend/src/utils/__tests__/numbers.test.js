import i18n from '../../i18n';
import { formatDecimal, parseDecimal } from '../numbers';
import { buildExtractionPayload, extractionCount } from '../extraction';
import { petMeta } from '../pets';

afterEach(() => i18n.changeLanguage('en'));

describe('parseDecimal', () => {
  it('reads a comma or a dot as the decimal mark', () => {
    expect(parseDecimal('22,5')).toBe(22.5);
    expect(parseDecimal('22.5')).toBe(22.5);
    expect(parseDecimal(' 4,80 ')).toBe(4.8);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('0.250')).toBe(0.25);
    expect(parseDecimal('12')).toBe(12);
  });

  it('reads English thousands separators', () => {
    expect(parseDecimal('1,250', 'en')).toBe(1250);
    expect(parseDecimal('1,250.50', 'en')).toBe(1250.5);
    expect(parseDecimal('12,345,678', 'en')).toBe(12345678);
    expect(parseDecimal('1,25', 'en')).toBe(1.25); // not a 3-digit group: a decimal comma
  });

  it.each(['fr', 'es'])('reads %s thousands separators', (lng) => {
    expect(parseDecimal('1.250,50', lng)).toBe(1250.5);
    expect(parseDecimal('1 250,50', lng)).toBe(1250.5);
    expect(parseDecimal('1 250', lng)).toBe(1250);
    expect(parseDecimal('1.250', lng)).toBe(1250);
    expect(parseDecimal('1,250', lng)).toBe(1.25); // the comma is the decimal mark
    expect(parseDecimal('22.5', lng)).toBe(22.5); // a dot typed "the English way"
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
  it('prints exactly what toFixed printed in English, rounding included', () => {
    expect(formatDecimal(12.5, 1)).toBe('12.5');
    expect(formatDecimal(12, 1)).toBe('12.0');
    expect(formatDecimal(1234.5, 2)).toBe('1234.50'); // no grouping
    expect(formatDecimal(1.45, 1)).toBe((1.45).toFixed(1));
    expect(formatDecimal(1.005, 2)).toBe((1.005).toFixed(2));
    expect(formatDecimal(12, { min: 0, max: 1 })).toBe('12');
    expect(formatDecimal(0.25, { min: 0, max: 1 })).toBe('0.3');
    expect(formatDecimal(4.125, { min: 0, max: 10 })).toBe('4.125');
  });

  it.each(['fr', 'es'])('prints a decimal comma in %s', async (lng) => {
    await i18n.changeLanguage(lng);
    expect(formatDecimal(12.5, 1)).toBe('12,5');
    expect(formatDecimal(45, 2)).toBe('45,00');
    expect(formatDecimal(1234.5, 2)).toBe('1234,50');
    expect(formatDecimal(0.5, { min: 0, max: 1 })).toBe('0,5');
    expect(formatDecimal(-1.5, 1)).toBe('-1,5');
  });

  it('is empty for anything that is not a number', () => {
    expect(formatDecimal(null, 1)).toBe('');
    expect(formatDecimal('abc', 1)).toBe('');
    expect(formatDecimal(NaN, 1)).toBe('');
  });

  it('formats a numeric string from the server', () => {
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

  it('prints "4,3 %" in French', async () => {
    await i18n.changeLanguage('fr');
    const s = weightInsight([pt(4.6, '2026-08-16'), pt(4.8, '2026-10-16')], 'kg').summary;
    expect(s).toMatch(/0,2 kg \(4,3 %\)/);
  });

  it('keeps "4.3%" in English', () => {
    const s = weightInsight([pt(4.6, '2026-08-16'), pt(4.8, '2026-10-16')], 'kg').summary;
    expect(s).toContain('0.2 kg (4.3%)');
  });
});

describe('pet age', () => {
  const pet = (age) => ({ type: 'cat', age });

  it('keeps the English wording', () => {
    expect(petMeta(pet(4))).toBe('Cat · 4 y');
    expect(petMeta(pet(1.5))).toBe('Cat · 1.5 y');
  });

  it('uses the comma and the right plural in French and Spanish', async () => {
    await i18n.changeLanguage('fr');
    expect(petMeta(pet(1.5))).toBe('Chat · 1,5 an');
    expect(petMeta(pet(3))).toBe('Chat · 3 ans');
    await i18n.changeLanguage('es');
    expect(petMeta(pet(1.5))).toBe('Gato · 1,5 años');
    expect(petMeta(pet(1))).toBe('Gato · 1 año');
  });

});
