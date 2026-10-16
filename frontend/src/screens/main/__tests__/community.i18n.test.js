// Community area in French (CHW-191): each migrated screen renders its copy
// from src/i18n, and user-entered data (pet and group names) is interpolated
// untranslated. English output is covered by the other tests, which run in en.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../../../services/prefs', () => ({
  getPref: jest.fn((_, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
const mockGet = jest.fn();
jest.mock('../../../services/api', () => ({
  get: (...a) => mockGet(...a),
  post: jest.fn(),
  del: jest.fn(),
  uploadImage: jest.fn(),
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Sam' } }) }));
const mockPet = { id: 'p1', name: 'Biscuit', type: 'dog', colorIndex: 0 };
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    pets: [mockPet],
    posts: [],
    groups: [{ id: 'g1', name: 'Dog lovers', members: 1, isJoined: false }],
    lostPets: [],
    myReports: [],
    refreshLostPets: jest.fn(() => Promise.resolve()),
  }),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import CommunityScreen from '../CommunityScreen';
import LostPetsScreen from '../LostPetsScreen';
import ModerationScreen from '../ModerationScreen';
import SegmentedControl from '../../../components/SegmentedControl';
import i18n from '../../../i18n';

let tree;
async function render(el) {
  await act(async () => { tree = TestRenderer.create(el); });
  return tree;
}
const texts = () => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
const nav = { navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => act(async () => { await i18n.changeLanguage('fr'); }));
afterEach(() => act(async () => {
  tree?.unmount();
  tree = null;
  await i18n.changeLanguage('en');
}));

test('Community speaks French, with the group name left as typed', async () => {
  await render(<CommunityScreen navigation={nav} />);
  expect(texts()).toContain('Communauté');
  const segmented = tree.root.findByType(SegmentedControl);
  expect(segmented.props.segments.map((s) => s.label)).toEqual(['Fil', 'Animaux perdus', 'Groupes']);

  await act(async () => segmented.props.onChange('groups'));
  expect(texts()).toEqual(expect.arrayContaining(['Dog lovers', '1 membre', 'Rejoindre']));
});

test('English: a one-member group reads "1 member" (was "1 members" before CHW-191, an intentional fix)', async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
  await render(<CommunityScreen navigation={nav} />);
  await act(async () => tree.root.findByType(SegmentedControl).props.onChange('groups'));
  expect(texts()).toContain('1 member');
});

test('the lost-pet report screen speaks French', async () => {
  await render(<LostPetsScreen navigation={nav} />);
  expect(texts()).toEqual(expect.arrayContaining(['Quel animal ?', 'Biscuit']));
});

test('Moderation speaks French', async () => {
  mockGet.mockResolvedValueOnce({ items: [], has_more: false });
  await render(<ModerationScreen navigation={nav} />);
  expect(texts()).toEqual(expect.arrayContaining(['Modération', 'Tout est en ordre']));
});
