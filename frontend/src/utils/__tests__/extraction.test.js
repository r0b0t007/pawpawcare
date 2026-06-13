import { dateOrNull, extractionCount, buildExtractionPayload } from '../extraction';

// A fully-populated working copy, as the review sheet builds it. Tests tweak
// clones of this.
const baseSel = () => ({
  vaccinations: [
    { included: true, name: 'Rabies', administered: '2026-05-12', due: '2027-05-12', notes: '' },
    { included: false, name: 'DHPP', administered: '', due: '', notes: '' }, // unchecked
    { included: true, name: '   ', administered: '', due: '', notes: '' }, // blank name
  ],
  medications: [
    { included: true, name: 'Simparica', dosage: '40mg', frequency: 'monthly', start: '', end: '', notes: '' },
  ],
  weight: { included: true, value: '18.4', unit: 'kg', date: '2026-05-12' },
  expense: { included: false, amount: '145', date: '2026-05-12' }, // opt-in, unchecked
  clinic: { included: true, name: 'Happy Paws', phone: ' 555-1234 ' },
  setTitle: true,
  setCategory: false,
});

describe('dateOrNull', () => {
  it('accepts a valid YYYY-MM-DD (trimmed)', () => {
    expect(dateOrNull('2026-05-12')).toBe('2026-05-12');
    expect(dateOrNull('  2026-05-12  ')).toBe('2026-05-12');
  });

  it('rejects anything else', () => {
    expect(dateOrNull('soon')).toBeNull();
    expect(dateOrNull('2026-5-12')).toBeNull(); // not zero-padded
    expect(dateOrNull('')).toBeNull();
    expect(dateOrNull(null)).toBeNull();
  });
});

describe('extractionCount', () => {
  it('counts only included, non-empty items', () => {
    // Rabies + Simparica + weight + clinic = 4 (DHPP unchecked, blank dropped,
    // expense unchecked).
    expect(extractionCount(baseSel())).toBe(4);
  });

  it('ignores weight/expense with no positive amount', () => {
    const sel = baseSel();
    sel.weight.value = '0'; // excluded — not > 0
    sel.expense.included = true;
    sel.expense.amount = ''; // excluded — NaN
    expect(extractionCount(sel)).toBe(3); // Rabies + Simparica + clinic
  });
});

describe('buildExtractionPayload', () => {
  it('includes only checked, non-empty records', () => {
    const p = buildExtractionPayload(baseSel());

    expect(p.vaccinations).toHaveLength(1);
    expect(p.vaccinations[0].name).toBe('Rabies');
    expect(p.medications[0].name).toBe('Simparica');
    expect(p.weight.value).toBe(18.4);
    expect(p.clinic.name).toBe('Happy Paws');
    // Opt-in expense left unchecked → omitted entirely.
    expect(p.expense).toBeUndefined();
    expect(p.set_title).toBe(true);
    expect(p.set_category).toBe(false);
  });

  it('trims strings and nulls empty optional fields', () => {
    const p = buildExtractionPayload(baseSel());
    expect(p.clinic.phone).toBe('555-1234');
    expect(p.vaccinations[0].notes).toBeNull();
    expect(p.medications[0].start_date).toBeNull();
  });

  it('sends invalid dates as null rather than blocking', () => {
    const sel = baseSel();
    sel.vaccinations[0].administered = 'last spring';
    const p = buildExtractionPayload(sel);
    expect(p.vaccinations[0].administered_date).toBeNull();
    expect(p.vaccinations[0].due_date).toBe('2027-05-12');
  });

  it('never includes pet_id or row ids (server sets pet_id from the route)', () => {
    const p = buildExtractionPayload(baseSel());
    expect(p).not.toHaveProperty('pet_id');
    expect(p.vaccinations[0]).not.toHaveProperty('pet_id');
    expect(p.vaccinations[0]).not.toHaveProperty('id');
    expect(p.weight).not.toHaveProperty('pet_id');
  });

  it('omits every record section when nothing is selected', () => {
    const sel = baseSel();
    sel.vaccinations.forEach((v) => { v.included = false; });
    sel.medications.forEach((m) => { m.included = false; });
    sel.weight.included = false;
    sel.clinic.included = false;
    const p = buildExtractionPayload(sel);

    expect(p).toEqual({ set_title: true, set_category: false });
  });
});
