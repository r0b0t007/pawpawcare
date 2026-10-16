jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
import { missingFor } from '../LostPetCard';

const today = new Date('2026-10-13T09:00:00');

it('counts calendar days from when the pet was last seen', () => {
  expect(missingFor('2026-10-10T18:00:00', '2026-10-13T08:00:00', today)).toBe('Missing 3 days');
  expect(missingFor(null, '2026-10-12T23:00:00', today)).toBe('Missing 1 day');
  expect(missingFor(null, '2026-10-13T07:00:00', today)).toBe('Missing today');
  expect(missingFor(null, null, today)).toBe('Missing');
});

it('reads in French when the app is in French', async () => {
  const i18n = require('../../../i18n').default;
  await i18n.changeLanguage('fr');
  try {
    expect(missingFor('2026-10-10T18:00:00', '2026-10-13T08:00:00', today)).toBe('Disparu depuis 3 jours');
    expect(missingFor(null, '2026-10-13T07:00:00', today)).toBe('Disparu aujourd\'hui');
  } finally {
    await i18n.changeLanguage('en');
  }
});
