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
const mockGroupsQuery = jest.fn();
jest.mock('../../../hooks/useGroups', () => ({ useGroupsQuery: () => mockGroupsQuery() }));
const mockFeedQuery = jest.fn();
jest.mock('../../../hooks/useFeed', () => ({ useFeedQuery: () => mockFeedQuery() }));
beforeEach(() => mockFeedQuery.mockReturnValue({
  data: [], isLoading: false, isError: false, isStale: false, refetch: jest.fn(),
}));
beforeEach(() => mockGroupsQuery.mockReturnValue({
  data: [{ id: 'g1', name: 'Dog lovers', members: 1, isJoined: false }],
  isLoading: false,
  isError: false,
  isStale: false,
  refetch: jest.fn(),
}));
const mockBoard = { data: [], isLoading: false, isError: false, isStale: false, refetch: jest.fn() };
jest.mock('../../../hooks/useLostPets', () => ({
  useLostPetsBoardQuery: () => mockBoard,
  useMyLostReportsQuery: () => ({ data: [], refetch: jest.fn() }),
}));
const mockInvalidateFeed = jest.fn();
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    invalidateFeed: mockInvalidateFeed,
    pets: [mockPet],
  }),
}));

import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
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

test('groups that failed to load say so in French, with a retry — not "no groups yet"', async () => {
  const refetch = jest.fn();
  mockGroupsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isStale: true, refetch });
  await render(<CommunityScreen navigation={nav} />);
  await act(async () => tree.root.findByType(SegmentedControl).props.onChange('groups'));

  expect(texts()).toEqual(expect.arrayContaining(['Impossible de charger les groupes.', 'Réessayer']));
  expect(texts()).not.toContain('Aucun groupe pour l\'instant');
  const retry = tree.root.findAll((n) => n.props.label === 'Réessayer' && typeof n.props.onPress === 'function')[0];
  await act(async () => retry.props.onPress());
  expect(refetch).toHaveBeenCalled();
});

// The feed loads on its own now: while it does, a spinner — not "no posts".
test('the feed shows it is loading, not that it is empty', async () => {
  mockFeedQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isStale: true, refetch: jest.fn() });
  await render(<CommunityScreen navigation={nav} />);

  expect(tree.root.findAllByType(ActivityIndicator).some((n) => n.props.accessibilityLabel === i18n.t('common.loading'))).toBe(true);
  expect(texts()).not.toContain("Aucune publication pour l'instant");
});

test('retrying a failed feed shows it loading, not the same error', async () => {
  mockFeedQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: true, isStale: true, refetch: jest.fn() });
  await render(<CommunityScreen navigation={nav} />);

  expect(tree.root.findAllByType(ActivityIndicator).some((n) => n.props.accessibilityLabel === i18n.t('common.loading'))).toBe(true);
  expect(texts()).not.toContain('Impossible de charger les publications.');
});

test('a feed that failed to load says so in French, with a retry — not "no posts yet"', async () => {
  const refetch = jest.fn();
  mockFeedQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isStale: true, refetch });
  await render(<CommunityScreen navigation={nav} />);

  expect(texts()).toContain('Impossible de charger les publications.');
  expect(texts()).not.toContain("Aucune publication pour l'instant");
  const retry = tree.root.findAll((n) => n.props.label === i18n.t('common.retry') && typeof n.props.onPress === 'function')[0];
  await act(async () => retry.props.onPress());
  expect(refetch).toHaveBeenCalled();
});

test('the lost-pet report screen speaks French', async () => {
  await render(<LostPetsScreen navigation={nav} />);
  expect(texts()).toEqual(expect.arrayContaining(['Quel animal ?', 'Biscuit']));
});

// The feed is cached: a post an admin removed must leave it too.
test('removing a reported post re-reads the feed', async () => {
  const { del } = require('../../../services/api');
  del.mockResolvedValue({});
  mockGet.mockResolvedValueOnce({
    items: [{ post: { id: 'x1', content: 'Spam', author_name: 'Kim', created_at: '2026-10-20T10:00:00Z' }, report_count: 2, reports: [] }],
    has_more: false,
  });
  await render(<ModerationScreen navigation={nav} />);
  const remove = tree.root.findAll((n) => n.props.label === i18n.t('moderation.remove') && typeof n.props.onPress === 'function')[0];
  await act(async () => remove.props.onPress());
  const dialog = tree.root.findAll((n) => typeof n.props.onConfirm === 'function' && n.props.visible)[0];
  await act(async () => dialog.props.onConfirm());

  expect(del).toHaveBeenCalledWith('/admin/posts/x1');
  expect(mockInvalidateFeed).toHaveBeenCalledTimes(1);
});

test('Moderation speaks French', async () => {
  mockGet.mockResolvedValueOnce({ items: [], has_more: false });
  await render(<ModerationScreen navigation={nav} />);
  expect(texts()).toEqual(expect.arrayContaining(['Modération', 'Tout est en ordre']));
});
