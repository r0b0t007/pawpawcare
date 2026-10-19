// After applying a vet document: duplicates are a quiet "N skipped", but
// items dropped because the pet is at its limit (CHW-245) are spelled out,
// with how many — otherwise a medication silently never gets its reminders.
import i18n from '../../i18n';
import { appliedToastText } from '../extraction';

const t = (key, opts) => i18n.t(key, opts);
const med = { name: 'Pill' };
const added = (count) => t('records.extract.added', { count });

afterEach(() => i18n.changeLanguage('en'));

test('nothing skipped: just what was added', () => {
  expect(appliedToastText({ medications: [med], weight: {} }, t)).toBe(added(2));
});

test('duplicates: the count of skipped items', () => {
  const text = appliedToastText({ medications: [med], skipped: [{ type: 'medication', name: 'Old', reason: 'already exists' }] }, t);
  expect(text).toBe(t('records.extract.withSkipped', { added: added(1), count: 1 }));
});

test.each(['en', 'fr', 'es'])('over the pet limit: says so, and how many (%s)', async (lang) => {
  await i18n.changeLanguage(lang);
  const text = appliedToastText({
    medications: [med],
    skipped: [
      { type: 'medication', name: 'Old', reason: 'already exists' },
      { type: 'medication', name: 'New', reason: 'limit reached' },
      { type: 'vaccination', name: 'Rabies', reason: 'limit reached' },
    ],
  }, t);

  expect(text).toBe(t('records.extract.withLimit', { added: added(1), count: 2 }));
  expect(text).toContain('2');
  expect(text).not.toMatch(/withLimit|\{\{/);
});
