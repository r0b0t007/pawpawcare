// Pure helpers for the AI extraction review sheet — extracted from
// MedicalRecordsScreen so the (security-relevant) apply-payload shaping is
// unit-testable. `sel` is the editable working copy the sheet builds from a
// document's stored extraction.

import { parseDecimal } from './numbers';

// A typed date is only sent if it's a valid YYYY-MM-DD; anything else → null
// (the user fills it in later rather than the request being blocked).
export const dateOrNull = (s) => (/^\d{4}-\d{2}-\d{2}$/.test((s || '').trim()) ? s.trim() : null);

// How many records the current selection would create — drives the Apply count.
// The typed weight / cost as numbers, or null when not included or not > 0.
const weightValue = (sel) => {
  const v = sel.weight?.included ? parseDecimal(sel.weight.value) : NaN;
  return v > 0 ? v : null;
};
const expenseAmount = (sel) => {
  const v = sel.expense?.included ? parseDecimal(sel.expense.amount) : NaN;
  return v > 0 ? v : null;
};

export const extractionCount = (sel) =>
  sel.vaccinations.filter((v) => v.included && v.name.trim()).length +
  sel.medications.filter((m) => m.included && m.name.trim()).length +
  (weightValue(sel) !== null ? 1 : 0) +
  (expenseAmount(sel) !== null ? 1 : 0) +
  (sel.clinic?.included && sel.clinic.name.trim() ? 1 : 0);

// Build the apply request from the user's edited, approved subset. Only
// included, non-empty items are sent; dates are validated; pet_id is never
// included — the server sets it from the verified route.
export const buildExtractionPayload = (sel) => {
  const p = { set_title: sel.setTitle, set_category: sel.setCategory };

  const vax = sel.vaccinations.filter((v) => v.included && v.name.trim());
  if (vax.length) {
    p.vaccinations = vax.map((v) => ({
      name: v.name.trim(),
      administered_date: dateOrNull(v.administered),
      due_date: dateOrNull(v.due),
      notes: v.notes.trim() || null,
    }));
  }

  const meds = sel.medications.filter((m) => m.included && m.name.trim());
  if (meds.length) {
    p.medications = meds.map((m) => ({
      name: m.name.trim(),
      dosage: m.dosage.trim() || null,
      frequency: m.frequency,
      start_date: dateOrNull(m.start),
      end_date: dateOrNull(m.end),
      notes: m.notes.trim() || null,
    }));
  }

  const weight = weightValue(sel);
  if (weight !== null) {
    p.weight = { value: weight, unit: sel.weight.unit, date: dateOrNull(sel.weight.date) };
  }
  const amount = expenseAmount(sel);
  if (amount !== null) {
    p.expense = { amount, date: dateOrNull(sel.expense.date) };
  }
  if (sel.clinic?.included && sel.clinic.name.trim()) {
    p.clinic = { name: sel.clinic.name.trim(), phone: sel.clinic.phone.trim() || null };
  }

  return p;
};

/**
 * The toast after applying a document's extracted items. Duplicates are a
 * quiet "N skipped"; items over the pet's limit (CHW-245) are spelled out,
 * or a medication would silently never get its reminders.
 */
export function appliedToastText(result, t) {
  const added =
    (result.vaccinations?.length || 0) + (result.medications?.length || 0) +
    (result.weight ? 1 : 0) + (result.expense ? 1 : 0) + (result.clinic ? 1 : 0);
  const skipped = result.skipped || [];
  const addedText = t('records.extract.added', { count: added });
  const overLimit = skipped.filter((s) => s.reason === 'limit reached').length;
  if (overLimit) return t('records.extract.withLimit', { added: addedText, count: overLimit });
  return skipped.length ? t('records.extract.withSkipped', { added: addedText, count: skipped.length }) : addedText;
}
