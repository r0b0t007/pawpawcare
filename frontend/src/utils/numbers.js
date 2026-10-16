// Decimal numbers in the app language: '12.5' in English, '12,5' in French
// and Spanish. One pair of helpers for every weight, amount and size the app
// prints or reads, so a value typed on a French keypad ('22,5') is never cut
// to 22 by parseFloat.
import { intlLocale } from '../i18n';

// Formatters are cached per locale + digits: building one is costly on Hermes.
const formatters = new Map();
const formatter = (min, max, locale) => {
  const key = `${locale}|${min}|${max}`;
  let f = formatters.get(key);
  if (!f) {
    // No grouping: English output stays what toFixed printed ('1234.50').
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false });
    formatters.set(key, f);
  }
  return f;
};

/**
 * A number with the app language's decimal mark. `digits` fixes the
 * fraction digits (like toFixed); `{ min, max }` lets trailing zeros drop
 * ('12' rather than '12.0'). '' for anything that isn't a finite number.
 */
export const formatDecimal = (value, digits = 1, locale = intlLocale()) => {
  const n = typeof value === 'number' ? value : parseDecimal(value);
  if (!Number.isFinite(n)) return '';
  const { min, max } = typeof digits === 'number' ? { min: digits, max: digits } : digits;
  return formatter(min, max, locale).format(n);
};

/**
 * Reads a typed or extracted number, accepting ',' or '.' as the decimal
 * mark ('22,5' and '22.5' are both 22.5). Like parseFloat it reads the
 * leading number and ignores what follows ('22,5 kg' is 22.5); NaN when
 * there is no number. Numbers pass through unchanged.
 */
export const parseDecimal = (input) => {
  if (typeof input === 'number') return input;
  const match = /^\s*([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+))/.exec(String(input ?? ''));
  return match ? Number(match[1].replace(',', '.')) : NaN;
};
