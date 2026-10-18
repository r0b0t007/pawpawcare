// CHW-230: the banner on the reminder screens when this phone can't show
// notifications, the in-context ask after something reminder-worthy is saved,
// and the app-root watcher that acts on a grant wherever it happens.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('../ConfirmDialog', () => function ConfirmDialog() { return null; });
jest.mock('../Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
const mockRegisterPushDevice = jest.fn(() => Promise.resolve());
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ registerPushDevice: mockRegisterPushDevice }) }));
const mockReminders = [{ id: 'r1' }];
jest.mock('../../context/DataContext', () => ({ useData: () => ({ reminders: mockReminders }) }));
let mockPermission;
let mockAnswer;
jest.mock('../../services/notifications', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve(mockPermission)),
  requestNotificationPermission: jest.fn(() => Promise.resolve(mockAnswer)),
  scheduleLocalReminders: jest.fn(),
}));
let mockPrefs = {};
jest.mock('../../services/prefs', () => ({
  getPref: jest.fn((key, fallback) => Promise.resolve(key in mockPrefs ? mockPrefs[key] : fallback)),
  setPref: jest.fn((key, value) => { mockPrefs[key] = value; return Promise.resolve(); }),
}));

import React from 'react';
import { AppState, Linking, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import NotificationsBanner from '../NotificationsBanner';
import Button from '../Button';
import ConfirmDialog from '../ConfirmDialog';
import { showToast } from '../Toast';
import {
  NotificationPermissionWatcher,
  resetNotificationPermissionForTests,
} from '../../hooks/useNotificationPermission';
import { useNotificationsPrompt } from '../../hooks/useNotificationsPrompt';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleLocalReminders,
} from '../../services/notifications';

let foreground;
const flat = (node) => (node.children || []).map((c) => (typeof c === 'string' ? c : flat(c))).join('');

async function render(element) {
  let tree;
  await act(async () => { tree = TestRenderer.create(element); });
  return tree;
}
// The app root mounts the watcher once; screens mount banners.
const withWatcher = (element) => (
  <>
    <NotificationPermissionWatcher />
    {element}
  </>
);
const texts = (tree) => tree.root.findAllByType(Text).map(flat);
const bannerShown = (tree) => tree.root.findAllByType(Button).length > 0;
const pressButton = (tree, label) => act(async () => tree.root.findAll((n) => n.type === Button && n.props.label === label)[0].props.onPress());
const settle = (ms = 450) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  jest.clearAllMocks();
  resetNotificationPermissionForTests();
  mockPrefs = {};
  mockAnswer = { status: 'granted', canAskAgain: true };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
    foreground = () => handler('active');
    return { remove: jest.fn() };
  });
  jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve());
});

describe('NotificationsBanner', () => {
  test('hidden while notifications are allowed', async () => {
    mockPermission = { status: 'granted', canAskAgain: true };
    const tree = await render(withWatcher(<NotificationsBanner />));
    expect(bannerShown(tree)).toBe(false);
  });

  test('not decided yet: "Turn on" shows the prompt, then the watcher registers and schedules', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(withWatcher(<NotificationsBanner />));
    expect(texts(tree)).toContain('Turn on reminders');

    await pressButton(tree, 'Turn on');
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
    expect(scheduleLocalReminders).toHaveBeenCalledWith(mockReminders);
    expect(bannerShown(tree)).toBe(false);
  });

  test('blocked for good: "Open settings" opens the phone settings, no prompt', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    const tree = await render(withWatcher(<NotificationsBanner />));
    expect(texts(tree)).toContain('Notifications are off');

    await pressButton(tree, 'Open settings');
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  // Android only reveals "blocked for good" by being asked: the request comes
  // back refused at once with no dialog. The tap must not look dead.
  test('a request that ends blocked says so and switches to "Open settings"', async () => {
    mockPermission = { status: 'denied', canAskAgain: true };
    mockAnswer = { status: 'denied', canAskAgain: false };
    const tree = await render(withWatcher(<NotificationsBanner />));

    await pressButton(tree, 'Turn on');
    expect(showToast).toHaveBeenCalledWith('Notifications are blocked for PawPawCare. Use “Open settings” to turn them on.');
    expect(Linking.openSettings).not.toHaveBeenCalled(); // never forced into Settings
    expect(texts(tree)).toContain('Notifications are off');
  });

  test('a first "Don\'t allow" (Android can ask again) shows no toast', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    mockAnswer = { status: 'denied', canAskAgain: true };
    const tree = await render(withWatcher(<NotificationsBanner />));

    await pressButton(tree, 'Turn on');
    expect(showToast).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Turn on reminders');
  });

  test('two banners stay in step and the setup runs once', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(withWatcher(<><NotificationsBanner /><NotificationsBanner /></>));

    await pressButton(tree, 'Turn on');
    expect(bannerShown(tree)).toBe(false);
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationPermissionWatcher', () => {
  // Review finding: a grant made in Settings while no banner was mounted
  // used to go unnoticed until the next sign-in.
  test('a grant in Settings with no banner on screen still registers and schedules', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    await render(<NotificationPermissionWatcher />);

    mockPermission = { status: 'granted', canAskAgain: true };
    await act(async () => { foreground(); });
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
    expect(scheduleLocalReminders).toHaveBeenCalledTimes(1);
  });

  test('already allowed at launch: nothing to do (sign-in registered)', async () => {
    mockPermission = { status: 'granted', canAskAgain: true };
    await render(<NotificationPermissionWatcher />);
    expect(mockRegisterPushDevice).not.toHaveBeenCalled();
  });

  test('one foreground listener for the whole app, however many banners', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    await render(withWatcher(<><NotificationsBanner /><NotificationsBanner /><NotificationsBanner /></>));
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(getNotificationPermission).toHaveBeenCalledTimes(1);
  });
});

describe('useNotificationsPrompt (the in-context ask)', () => {
  let api;
  function Harness() {
    api = useNotificationsPrompt();
    return api.prompt;
  }
  const dialog = (tree) => tree.root.findByType(ConfirmDialog);

  test('asks right after a save, once the save\'s motion is over', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(withWatcher(<Harness />));

    await act(async () => { expect(await api.maybeAsk()).toBe(true); });
    expect(dialog(tree).props.visible).toBe(false); // not mid-animation
    await settle();
    expect(dialog(tree).props.visible).toBe(true);
    expect(dialog(tree).props.title).toBe('Get reminders on this phone?');
  });

  test('"Not now" waits 14 days before asking again', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(withWatcher(<Harness />));

    await act(async () => { await api.maybeAsk(); });
    await settle();
    await act(async () => dialog(tree).props.onCancel());
    expect(mockPrefs.notificationsAskSnoozedUntil).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);

    await act(async () => { expect(await api.maybeAsk()).toBe(false); });
  });

  test('"Turn on" then "Don\'t allow" in the system dialog also waits 14 days', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    mockAnswer = { status: 'denied', canAskAgain: true };
    const tree = await render(withWatcher(<Harness />));

    await act(async () => { await api.maybeAsk(); });
    await settle();
    await act(async () => dialog(tree).props.onConfirm());
    await settle(400);
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockPrefs.notificationsAskSnoozedUntil).toBeGreaterThan(Date.now());
    await act(async () => { expect(await api.maybeAsk()).toBe(false); });
  });

  test('leaving the screen right after "Turn on" never prompts over another screen', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(withWatcher(<Harness />));

    await act(async () => { await api.maybeAsk(); });
    await settle();
    await act(async () => dialog(tree).props.onConfirm());
    act(() => tree.unmount());
    await settle(400);
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });

  test('never asks once allowed, or once the OS can no longer prompt', async () => {
    mockPermission = { status: 'granted', canAskAgain: true };
    await render(withWatcher(<Harness />));
    await act(async () => { expect(await api.maybeAsk()).toBe(false); });

    resetNotificationPermissionForTests();
    mockPermission = { status: 'denied', canAskAgain: false };
    await render(withWatcher(<Harness />));
    await act(async () => { expect(await api.maybeAsk()).toBe(false); });
  });
});
