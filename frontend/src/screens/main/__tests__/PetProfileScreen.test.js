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
// The menu opens in a Sheet, which needs a gesture root.
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('../../../hooks/useGamification', () => ({
  useGamificationSummary: () => ({ data: undefined, refetch: jest.fn(), isStale: false }),
  milestoneLabel: () => null,
}));
jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
let mockMyReports = [];
const mockRefetchMyReports = jest.fn();
jest.mock('../../../hooks/useLostPets', () => ({
  useMyLostReportsQuery: () => ({ data: mockMyReports, refetch: mockRefetchMyReports }),
}));
jest.mock('../../../hooks/useToday', () => ({ useToday: () => new Date('2026-10-12T10:00:00') }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

let mockPets = [];
jest.mock('../../../context/DataContext', () => {
  const noop = () => Promise.resolve(null);
  return {
    useData: () => ({
      pets: mockPets,
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

// CHW-191: the profile's strings come from i18n. English stays exactly as it
// was; in French the chrome is translated while the pet's name (user data)
// is shown as typed.
test('renders its chrome in the app language, never translating the pet name', async () => {
  const i18n = require('../../../i18n').default;
  let tree;
  mockPets = [{ ...LUNA, type: 'cat', age: 3, microchipped: true }];
  act(() => {
    tree = TestRenderer.create(<PetProfileScreen {...props} />);
  });
  expect(texts(tree)).toEqual(expect.arrayContaining([
    'Nothing to give today', 'WEIGHT — 4.2 KG', '3 yrs · Male · Microchipped', 'Cat',
  ]));

  try {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(texts(tree)).toEqual(expect.arrayContaining([
      'Luna', "Rien à donner aujourd'hui", 'POIDS — 4,2 KG', '3 ans · Mâle · Pucé', 'Chat',
    ]));
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    act(() => tree.unmount());
  }
});

// My lost-pet reports load on their own (useMyLostReportsQuery). Until they
// have, the menu offers neither action: "report lost" for a pet already on
// the board would overwrite its report with an empty form.
describe('the lost-pet menu action', () => {
  const menuTitles = (tree) => {
    const more = tree.root.findAll((n) => n.props.accessibilityLabel === 'More actions for Luna' && n.props.onPress);
    act(() => more[0].props.onPress());
    return tree.root.findAll((n) => n.props.chevron && typeof n.props.title === 'string').map((n) => n.props.title);
  };
  const open = () => {
    let tree;
    mockPets = [LUNA];
    act(() => { tree = TestRenderer.create(<PetProfileScreen {...props} />); });
    return tree;
  };
  afterEach(() => { mockMyReports = []; });

  // A co-owner can report the pet from another phone.
  it('re-reads my reports when the profile is focused again', () => {
    const { useRefetchOnFocus } = require('../../../hooks/useRefetchOnFocus');
    const tree = open();
    expect(useRefetchOnFocus).toHaveBeenCalledWith(mockRefetchMyReports);
    act(() => tree.unmount());
  });

  it('is held back until my reports have loaded', () => {
    mockMyReports = undefined;
    const tree = open();
    const titles = menuTitles(tree);
    expect(titles).toContain('Edit details');
    expect(titles).not.toContain('Report Luna as lost');
    expect(titles).not.toContain('Mark Luna as found');
    act(() => tree.unmount());
  });

  it('offers to report a pet that is not on the board', () => {
    const tree = open();
    expect(menuTitles(tree)).toContain('Report Luna as lost');
    act(() => tree.unmount());
  });

  it('offers to mark a lost pet found, under the lost banner', () => {
    mockMyReports = [{ id: 'r1', petId: 'p1', status: 'active' }];
    const tree = open();
    expect(texts(tree)).toContain('Luna is reported lost');
    const titles = menuTitles(tree);
    expect(titles).toContain('Mark Luna as found');
    expect(titles).not.toContain('Report Luna as lost');
    act(() => tree.unmount());
  });
});
