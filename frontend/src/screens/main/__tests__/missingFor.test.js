jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
import { missingFor } from '../LostPetCard';

const today = new Date('2026-10-13T09:00:00');

it('counts calendar days from when the pet was last seen', () => {
  expect(missingFor('2026-10-10T18:00:00', '2026-10-13T08:00:00', today)).toBe('Missing 3 days');
  expect(missingFor(null, '2026-10-12T23:00:00', today)).toBe('Missing 1 day');
  expect(missingFor(null, '2026-10-13T07:00:00', today)).toBe('Missing today');
  expect(missingFor(null, null, today)).toBe('Missing');
});
