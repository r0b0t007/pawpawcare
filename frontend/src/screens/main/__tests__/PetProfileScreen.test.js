// The profile stays mounted while a deleted / left pet is popped, and first
// renders before pets have loaded — so `pet` goes undefined -> defined ->
// undefined across renders. Every hook must run on every render, or React
// throws "Rendered more/fewer hooks than expected" and the release app
// crashes (the memos used to sit below the `!pet` early return).

// expo-font (via @expo/vector-icons) requires expo-asset, which isn't a
// dependency of this app — icons don't render in Jest anyway.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../hooks/useGamification', () => ({
  useGamificationSummary: () => ({ data: undefined, refetch: jest.fn(), isStale: false }),
  milestoneLabel: () => null,
}));
jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('../../../hooks/useToday', () => ({ useToday: () => new Date('2026-10-12T10:00:00') }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

let mockPets = [];
jest.mock('../../../context/DataContext', () => {
  const noop = () => Promise.resolve(null);
  return {
    useData: () => ({
      pets: mockPets,
      myReports: [],
      medDoseDays: {},
      ...Object.fromEntries(
        [
          'addFavoriteFood', 'removeFavoriteFood', 'addActivity', 'addMedication', 'deleteMedication',
          'logMedicationDose', 'reportPetLost', 'resolveLostPet', 'addWeight', 'deleteWeight', 'addExpense',
          'deleteExpense', 'getPetShare', 'invitePetMember', 'cancelPetInvite', 'removePetMember', 'leavePet',
          'createShareLink', 'revokeShareLinks', 'getCareProfile', 'saveCareProfile', 'createCareLink',
          'revokeCareLinks',
        ].map((k) => [k, noop]),
      ),
    }),
  };
});

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import PetProfileScreen from '../PetProfileScreen';

const LUNA = {
  id: 'p1',
  ownerId: 'u1',
  name: 'Luna',
  species: 'cat',
  breed: '',
  gender: 'male',
  colorIndex: 0,
  vaccinations: [],
  weights: [{ id: 'w1', weight: 4.2, unit: 'kg', loggedAt: '2026-10-01T00:00:00Z' }],
  weightUnit: 'kg',
  medications: [],
  activities: [],
  favoriteFoods: [],
  expenses: [],
};

const props = { route: { params: { petId: 'p1' } }, navigation: { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() } };
const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

test('renders through pet missing -> loaded -> removed without a hooks-order crash', () => {
  let tree;
  mockPets = []; // first render before pets load
  act(() => {
    tree = TestRenderer.create(<PetProfileScreen {...props} />);
  });
  expect(texts(tree)).toContain('Pet not found.');

  mockPets = [LUNA]; // pets arrive
  act(() => tree.update(<PetProfileScreen {...props} />));
  expect(texts(tree)).toContain('Luna');

  mockPets = []; // pet deleted / left while the screen is still mounted
  act(() => tree.update(<PetProfileScreen {...props} />));
  expect(texts(tree)).toContain('Pet not found.');
});

// Vaccinations that didn't load are unknown, not "none due": no "All good"
// pill, and no "Add a first vaccine" invitation for records that exist.
test("doesn't call a pet all good when its vaccinations didn't load", () => {
  let tree;
  mockPets = [LUNA];
  act(() => {
    tree = TestRenderer.create(<PetProfileScreen {...props} />);
  });
  expect(texts(tree)).toContain('All good');

  mockPets = [{ ...LUNA, missing: ['vaccinations'] }];
  act(() => tree.update(<PetProfileScreen {...props} />));
  expect(texts(tree)).not.toContain('All good');
  expect(texts(tree)).not.toContain('Add a first vaccine');
  expect(texts(tree)).toContain("Couldn't load vaccines");
  act(() => tree.unmount());
});
