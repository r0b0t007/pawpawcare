// Decimal numbers in the app language: '12.5' in English, '12,5' in French
// and Spanish. One pair of helpers for every weight, amount and size the app
// prints or reads, so a value typed on a French keypad ('22,5') is never cut
// to 22 by parseFloat.
import { currentLocale } from '../i18n';

// The decimal mark of each app language. A fixed map, not Intl: Hermes'
// Intl.NumberFormat#formatToParts is incomplete on some platforms, and the
// parser below must agree with what the formatter prints.
const DECIMAL_MARK = { en: '.', fr: ',', es: ',' };

/**
 * A number with the app language's decimal mark. `digits` fixes the
 * fraction digits (like toFixed); `{ min, max }` rounds to `max` and then
 * drops trailing zeros down to `min` ('12' rather than '12.0'). The digits
 * are toFixed's, so rounding and English output are exactly what the app
 * printed before; only the mark changes. '' for anything that isn't a
 * finite number.
 */
export const formatDecimal = (value, digits = 1, lng = currentLocale()) => {
  const n = typeof value === 'number' ? value : parseDecimal(value);
  if (!Number.isFinite(n)) return '';
  const { min, max } = typeof digits === 'number' ? { min: digits, max: digits } : digits;
  let text = n.toFixed(max);
  if (max > min) {
    const [int, frac] = text.split('.');
    const kept = frac.replace(/0+$/, '').padEnd(min, '0');
    text = kept ? `${int}.${kept}` : int;
  }
  return text.replace('.', DECIMAL_MARK[lng] ?? '.');
};

/**
 * Reads a typed or extracted number, in any app language:
 *  - one mark, ',' or '.', is always the decimal mark ('22,5', '1.250'):
 *    nobody types a thousands separator into a weight;
 *  - both marks: the last one is the decimal mark and the other must group
 *    thousands ('1,250.50', '1.250,50');
 *  - a repeated mark only as a thousands separator ('1.250.000').
 * Anything else ('22,,5', '1.2.5') is NaN, so the form refuses it instead
 * of saving a value 10 or 1000 times off. Like parseFloat it reads the
 * leading number and ignores what follows ('22,5 kg' is 22.5); NaN when
 * there is no number. Numbers pass through.
 */
export const parseDecimal = (input) => {
  if (typeof input === 'number') return input;
  const match = /^\s*([-+]?)([\d.,]*\d|[.,]\d+)/.exec(String(input ?? ''));
  if (!match) return NaN;
  const [, sign, s] = match;
  const commas = s.split(',').length - 1;
  const dots = s.split('.').length - 1;
  let digits;
  if (commas + dots === 0) {
    digits = s;
  } else if (commas + dots === 1) {
    digits = s.replace(',', '.');
  } else {
    const decimal = commas && dots ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.') : null;
    const group = decimal === ',' ? '.' : decimal === '.' ? ',' : (commas ? ',' : '.');
    const g = group === '.' ? '\\.' : ',';
    const d = decimal === '.' ? '\\.' : ',';
    const valid = new RegExp(decimal ? `^\\d{1,3}(${g}\\d{3})*${d}\\d+$` : `^\\d{1,3}(${g}\\d{3})+$`);
    if (!valid.test(s)) return NaN;
    digits = s.split(group).join('').replace(',', '.');
  }
  return Number(sign + digits);
};

/**
 * The count to pass to a plural string for a possibly fractional number.
 * Hermes has no Intl.PluralRules, so i18next only knows "1 is one, the rest
 * is other" there; this picks the same form on every engine: in French a
 * value below 2 is singular ("1,5 an"), elsewhere a fraction is plural
 * ("1,5 años", "1.5 years").
 */
export const pluralCount = (n, lng = currentLocale()) => {
  if (Number.isInteger(n)) return n;
  return lng === 'fr' && Math.abs(n) < 2 ? 1 : 2;
};
