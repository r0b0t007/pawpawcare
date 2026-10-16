// Decimal numbers in the app language: '12.5' in English, '12,5' in French
// and Spanish. One pair of helpers for every weight, amount and size the app
// prints or reads, so a value typed on a French keypad ('22,5') is never cut
// to 22 by parseFloat.
import { currentLocale, intlLocale } from '../i18n';

// The decimal mark per locale, read once from Intl (cached: building a
// formatter is costly on Hermes).
const marks = new Map();
const decimalMark = (locale) => {
  if (!marks.has(locale)) {
    const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal');
    marks.set(locale, part ? part.value : '.');
  }
  return marks.get(locale);
};

/**
 * A number with the app language's decimal mark. `digits` fixes the
 * fraction digits (like toFixed); `{ min, max }` rounds to `max` and then
 * drops trailing zeros down to `min` ('12' rather than '12.0'). The digits
 * are toFixed's, so rounding and English output are exactly what the app
 * printed before; only the mark changes. '' for anything that isn't a
 * finite number.
 */
export const formatDecimal = (value, digits = 1, locale = intlLocale()) => {
  const n = typeof value === 'number' ? value : parseDecimal(value, 'en');
  if (!Number.isFinite(n)) return '';
  const { min, max } = typeof digits === 'number' ? { min: digits, max: digits } : digits;
  let text = n.toFixed(max);
  if (max > min) {
    const [int, frac] = text.split('.');
    const kept = frac.replace(/0+$/, '').padEnd(min, '0');
    text = kept ? `${int}.${kept}` : int;
  }
  return text.replace('.', decimalMark(locale));
};

/**
 * Reads a typed or extracted number. The decimal mark follows the app
 * language, but a dot or comma typed "the other way" still works:
 *  - en: '.' is the decimal mark and ',' groups thousands ('1,250' = 1250);
 *    a lone ',' not followed by exactly three digits is a decimal ('22,5').
 *  - fr/es: ',' is the decimal mark and '.' or a space groups thousands
 *    ('1.250,50' = 1250.5, '1 250' = 1250); a lone '.' not followed by
 *    exactly three digits is a decimal ('22.5').
 *  - Both marks present: the last one is the decimal mark.
 * Like parseFloat it reads the leading number and ignores what follows
 * ('22,5 kg' is 22.5); NaN when there is no number. Numbers pass through.
 */
export const parseDecimal = (input, lng = currentLocale()) => {
  if (typeof input === 'number') return input;
  const match = /^\s*([-+]?[\d.,   ]*\d|[-+]?[.,]\d+)/.exec(String(input ?? ''));
  if (!match) return NaN;
  let s = match[1].replace(/[   ]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimal = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimal = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0 || lastDot >= 0) {
    const mark = lastComma >= 0 ? ',' : '.';
    const grouping = lng === 'en' ? ',' : '.';
    const repeated = s.indexOf(mark) !== s.lastIndexOf(mark);
    const thousands = /^[-+]?[1-9]\d{0,2}$/.test(s.slice(0, s.indexOf(mark))) && /^\d{3}$/.test(s.slice(s.lastIndexOf(mark) + 1));
    decimal = repeated || (mark === grouping && thousands) ? null : mark;
  }
  const other = decimal === ',' ? '.' : ',';
  s = s.split(decimal === null ? /[.,]/ : other).join('');
  if (decimal === ',') s = s.replace(',', '.');
  return Number(s);
};
