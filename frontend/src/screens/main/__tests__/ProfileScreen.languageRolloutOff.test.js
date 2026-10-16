// Language setting with device-language detection switched OFF
// (src/i18n/rollout.js), the kill switch: the app starts in English, "Device
// default" is not offered, and only an explicit choice changes the language.
// The shipped mode (detection on) is covered in ProfileScreen.language.test.js.
jest.mock('../../../i18n/rollout', () => ({ FOLLOW_DEVICE_LANGUAGE: false }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/prefs', () => ({
  getPref: jest.fn((_, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../services/notifications', () => ({
  scheduleLocalReminders: jest.fn(),
  cancelAllLocalReminders: jest.fn(),
}));
jest.mock('../../../services/exportRecords', () => ({ exportRecords: jest.fn() }));
jest.mock('../../../services/sentry', () => ({ captureException: jest.fn(), isSentryEnabled: () => false }));
jest.mock('../../../services/analytics', () => ({
  isAnalyticsEnabled: jest.fn(() => true),
  setAnalyticsEnabled: jest.fn(),
}));
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
const mockUpdateUser = jest.fn(() => Promise.resolve(true));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Sam Rivera', email: 's@example.com' },
    isAdmin: false,
    logout: jest.fn(),
    updateUser: mockUpdateUser,
  }),
}));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ invites: [], reminders: [], pets: [{ id: 'p1', name: 'Biscuit' }] }),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen';
import ListRow from '../../../components/ListRow';
import Chip from '../../../components/Chip';
import i18n, { languageChoice, setLanguageChoice } from '../../../i18n';
import { setPref } from '../../../services/prefs';

let mounted;
async function render() {
  await act(async () => {
    mounted = TestRenderer.create(<ProfileScreen navigation={{ navigate: jest.fn() }} />);
  });
  return mounted;
}
const rowTitles = (tree) => tree.root.findAll((n) => n.type === ListRow).map((n) => n.props.title);
const languageRow = (tree, title) => tree.root.findAll((n) => n.type === ListRow && n.props.title === title)[0];
const chip = (tree, label) => tree.root.findAll((n) => n.type === Chip && n.props.label === label)[0];

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(async () => {
  mounted?.unmount();
  mounted = null;
  await setLanguageChoice('en');
}));

describe('with device detection switched off (the kill switch)', () => {
  test('the row starts in English and offers only the three languages', async () => {
    const tree = await render();
    const row = languageRow(tree, 'App language');
    expect(row.props.value).toBe('English');
    expect(languageChoice()).toBe('en');

    await act(async () => row.props.onPress());
    expect(['English', 'Français', 'Español'].map((l) => chip(tree, l).props.active))
      .toEqual([true, false, false]);
    expect(chip(tree, 'Device default')).toBeUndefined();
  });

  test('an explicit choice still switches the screen and is saved', async () => {
    const tree = await render();
    await act(async () => languageRow(tree, 'App language').props.onPress());
    await act(async () => {
      await chip(tree, 'Español').props.onPress();
    });
    expect(i18n.language).toBe('es');
    expect(languageChoice()).toBe('es');
    expect(setPref).toHaveBeenCalledWith('language', 'es');
    expect(rowTitles(tree)).toContain('Cerrar sesión');
  });
});
