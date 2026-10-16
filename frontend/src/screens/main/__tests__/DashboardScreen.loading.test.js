// Home's first load: the pets row shows (read-only) as soon as the React Query
// pets list has arrived, while DataContext's full load is still running. No
// verdict ("all good", "All caught up", "Nothing scheduled") may show, and no
// pet can be opened, until that full load (dataLoaded) has landed.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/observe', () => ({ useObserve: () => ({ markInteractive: jest.fn() }) }));
jest.mock('../../../hooks/useGamification', () => ({
  useGamificationSummary: () => ({ data: undefined, refetch: jest.fn(), isStale: false }),
  useGamificationRecap: () => ({ data: undefined, refetch: jest.fn(), isStale: false }),
  milestoneLabel: () => null,
}));
jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('../../../hooks/useToday', () => ({ useToday: () => new Date('2026-10-15T10:00:00') }));
jest.mock('../../../services/prefs', () => ({
  getPref: jest.fn(() => Promise.resolve(null)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../services/storeReview', () => ({ noteGoodMoment: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam' } }) }));

let mockStore = {};
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    pets: [],
    posts: [],
    reminders: [],
    unreadCount: 0,
    medDoseDays: {},
    medDoseCounts: {},
    markVaccinationComplete: jest.fn(),
    logMedicationDose: jest.fn(),
    ...mockStore,
  }),
}));
let mockEarlyPets;
const mockUsePetsQuery = jest.fn(() => ({ data: mockEarlyPets }));
jest.mock('../../../hooks/usePets', () => ({ usePetsQuery: (opts) => mockUsePetsQuery(opts) }));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import DashboardScreen from '../DashboardScreen';
import PetCard from '../../../components/PetCard';

const BISCUIT = {
  id: 'p1',
  ownerId: 'u1',
  name: 'Biscuit',
  type: 'dog',
  breed: 'Labrador',
  colorIndex: 0,
  vaccinations: [],
  medications: [],
  activities: [],
  weights: [],
  favoriteFoods: [],
  expenses: [],
};

const navigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));
// Case-insensitive: the headline says "Biscuit is\nall good".
const VERDICTS = /all good|all caught up|nothing needs attention|nothing scheduled/i;

let tree;
async function render({ store, early }) {
  mockStore = store;
  mockEarlyPets = early;
  await act(async () => {
    tree = TestRenderer.create(<DashboardScreen navigation={navigation} />);
  });
  return texts(tree);
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

test('shows only placeholders before the pets list arrives', async () => {
  const shown = await render({ store: { dataLoaded: false, pets: [] }, early: undefined });

  expect(shown).not.toContain('Your pets');
  expect(shown.join('\n')).not.toMatch(VERDICTS);
});

test('shows the pets row from the pets list mid-load, read-only and without any verdict', async () => {
  const shown = await render({ store: { dataLoaded: false, pets: [] }, early: [BISCUIT] });

  expect(shown).toContain('Your pets');
  expect(shown).toContain('Biscuit');
  expect(shown.join('\n')).not.toMatch(VERDICTS);
  expect(shown).not.toContain('Coming up');

  // Opening a pet waits for the full record; so does adding one.
  const cards = tree.root.findAllByType(PetCard);
  expect(cards).toHaveLength(1);
  expect(cards[0].props.disabled).toBe(true);
  expect(shown).not.toContain('Add');
  // Only fetched while the first load runs.
  expect(mockUsePetsQuery).toHaveBeenCalledWith({ enabled: true });
});

test('shows the whole screen, interactive, once everything has loaded', async () => {
  const shown = await render({ store: { dataLoaded: true, pets: [BISCUIT] }, early: [BISCUIT] });

  expect(shown).toContain('Biscuit');
  expect(shown).toContain('Coming up');
  expect(shown).toContain('Add');
  expect(tree.root.findAllByType(PetCard)[0].props.disabled).toBe(false);
  expect(mockUsePetsQuery).toHaveBeenCalledWith({ enabled: false });
});

// Home stays mounted under the tab bar, so a language switch made in Profile
// must re-render it — including the Coming up rows its memo built (CHW-188).
test('switching the language re-renders Coming up dates and times at once', async () => {
  const i18n = require('../../../i18n').default;
  const reminder = {
    id: 'r1', pet_id: 'p1', title: 'Flea drops', enabled: true,
    schedule_type: 'once', fire_at: '2026-10-17T09:00:00',
  };
  const shown = await render({ store: { dataLoaded: true, pets: [BISCUIT], reminders: [reminder] }, early: [BISCUIT] });
  expect(shown).toContain('Biscuit · Oct 17, 9:00 AM');

  try {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(texts(tree)).toContain('Biscuit · 17 oct., 9:00');
    expect(texts(tree)).toContain('À venir');
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  }
  expect(texts(tree)).toContain('Biscuit · Oct 17, 9:00 AM');
});
