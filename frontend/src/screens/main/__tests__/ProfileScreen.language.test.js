// Language setting (CHW-188): Device default / English / Français / Español.
// Device detection is switched on since CHW-191 (src/i18n/rollout.js), so
// "Device default" (follow the phone) is offered first and is the default.
// Choosing a language switches the app at once (no restart), is saved on the
// device, and is sent to the account fire-and-forget. The kill-switch mode
// (detection off) is covered in ProfileScreen.languageRolloutOff.test.js.
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
// Unmount (clearing the sheet's exit timer) and go back to following the
// device (English under Jest), so no test depends on the one before it.
afterEach(() => act(async () => {
  mounted?.unmount();
  mounted = null;
  await setLanguageChoice('device');
}));

test('the Language row defaults to Device default and offers it first, then the three languages', async () => {
  const tree = await render();
  const row = languageRow(tree, 'App language');
  expect(row.props.value).toBe('Device default');

  await act(async () => row.props.onPress());
  const labels = tree.root.findAll((n) => n.type === Chip).map((n) => n.props.label);
  expect(labels).toEqual(['Device default', 'English', 'Français', 'Español']);
  expect(['Device default', 'English', 'Français', 'Español'].map((l) => chip(tree, l).props.active))
    .toEqual([true, false, false, false]);
});

test('picking Device default after an override follows the device again (English here)', async () => {
  const tree = await render();
  await act(async () => languageRow(tree, 'App language').props.onPress());
  await act(async () => {
    await chip(tree, 'Français').props.onPress();
  });
  expect(i18n.language).toBe('fr');

  await act(async () => languageRow(tree, 'Langue de l\'application').props.onPress());
  await act(async () => {
    await chip(tree, 'Langue de l\'appareil').props.onPress();
  });
  // jest-setup pins the device to English.
  expect(i18n.language).toBe('en');
  expect(languageChoice()).toBe('device');
  expect(setPref).toHaveBeenLastCalledWith('language', 'device');
  expect(mockUpdateUser).toHaveBeenLastCalledWith({ locale: 'en' });
  expect(languageRow(tree, 'App language').props.value).toBe('Device default');
});

test('choosing Français switches the screen at once, saves it and tells the account', async () => {
  const tree = await render();
  await act(async () => languageRow(tree, 'App language').props.onPress());

  await act(async () => {
    await chip(tree, 'Français').props.onPress();
  });

  expect(i18n.language).toBe('fr');
  expect(languageChoice()).toBe('fr');
  expect(setPref).toHaveBeenCalledWith('language', 'fr');
  expect(mockUpdateUser).toHaveBeenCalledWith({ locale: 'fr' });

  // Re-rendered in French, formal; user data (names) left as entered.
  const titles = rowTitles(tree);
  expect(titles).toContain('Langue de l\'application');
  expect(titles).toContain('Se déconnecter');
  const texts = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
  expect(texts).toContain('Profil');
  expect(texts).toContain('Bonjour, Sam');
  expect(texts).toContain('Vous prenez soin de Biscuit');
  expect(languageRow(tree, 'Langue de l\'application').props.value).toBe('Français');
});

test('Español uses formal es-ES copy, and English goes back to English', async () => {
  const tree = await render();
  await act(async () => languageRow(tree, 'App language').props.onPress());
  await act(async () => {
    await chip(tree, 'Español').props.onPress();
  });
  expect(rowTitles(tree)).toContain('Cerrar sesión');
  expect(mockUpdateUser).toHaveBeenLastCalledWith({ locale: 'es' });

  await act(async () => languageRow(tree, 'Idioma de la aplicación').props.onPress());
  await act(async () => {
    await chip(tree, 'English').props.onPress();
  });
  expect(i18n.language).toBe('en');
  expect(setPref).toHaveBeenLastCalledWith('language', 'en');
  expect(mockUpdateUser).toHaveBeenLastCalledWith({ locale: 'en' });
  expect(languageRow(tree, 'App language').props.value).toBe('English');
});
