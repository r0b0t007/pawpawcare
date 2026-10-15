// Home's first load: the pets row comes in as soon as DataContext has painted
// pets (petsReady), but nothing that states a verdict ("All caught up",
// "Nothing scheduled") may show until every domain has landed (dataLoaded).

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

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import DashboardScreen from '../DashboardScreen';

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

let tree;
async function render(store) {
  mockStore = store;
  await act(async () => {
    tree = TestRenderer.create(<DashboardScreen navigation={navigation} />);
  });
  return texts(tree);
}

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

const VERDICTS = /All caught up|Nothing needs attention|Nothing scheduled/;

test('shows only placeholders before pets have painted', async () => {
  const shown = await render({ dataLoaded: false, petsReady: false, pets: [] });

  expect(shown).not.toContain('Your pets');
  expect(shown.join('\n')).not.toMatch(VERDICTS);
});

test('shows the pets row as soon as pets paint, without any verdict', async () => {
  const shown = await render({ dataLoaded: false, petsReady: true, pets: [BISCUIT] });

  expect(shown).toContain('Your pets');
  expect(shown).toContain('Biscuit');
  // The hero and "Coming up" still wait for the rest of the load.
  expect(shown.join('\n')).not.toMatch(VERDICTS);
  expect(shown).not.toContain('Coming up');
});

test('shows the whole screen once everything has loaded', async () => {
  const shown = await render({ dataLoaded: true, petsReady: true, pets: [BISCUIT] });

  expect(shown).toContain('Biscuit');
  expect(shown).toContain('Coming up');
});
