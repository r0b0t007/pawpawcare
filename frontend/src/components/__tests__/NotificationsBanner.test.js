// CHW-230: the banner on the reminder screens when this phone can't show
// notifications, the in-context ask after something reminder-worthy is saved,
// and the setup that follows once permission is granted.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('../ConfirmDialog', () => function ConfirmDialog() { return null; });
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
import { resetNotificationPermissionForTests } from '../../hooks/useNotificationPermission';
import { useNotificationsPrompt } from '../../hooks/useNotificationsPrompt';
import { requestNotificationPermission, scheduleLocalReminders } from '../../services/notifications';

let foreground;
const flat = (node) => (node.children || []).map((c) => (typeof c === 'string' ? c : flat(c))).join('');

async function render(element) {
  let tree;
  await act(async () => { tree = TestRenderer.create(element); });
  return tree;
}
const texts = (tree) => tree.root.findAllByType(Text).map(flat);
const pressButton = (tree, label) => act(async () => tree.root.findAll((n) => n.type === Button && n.props.label === label)[0].props.onPress());

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
    const tree = await render(<NotificationsBanner />);
    expect(tree.toJSON()).toBeNull();
  });

  test('not decided yet: "Turn on" shows the prompt, then registers and schedules', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(<NotificationsBanner />);
    expect(texts(tree)).toContain('Turn on reminders');

    await pressButton(tree, 'Turn on');
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
    expect(scheduleLocalReminders).toHaveBeenCalledWith(mockReminders);
    expect(tree.toJSON()).toBeNull();
  });

  test('blocked for good: "Open settings" opens the phone settings, no prompt', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    const tree = await render(<NotificationsBanner />);
    expect(texts(tree)).toContain('Notifications are off');

    await pressButton(tree, 'Open settings');
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  // Seen on the Android emulator: blocked for good still reports canAskAgain
  // until asked, and the request is refused at once with no dialog.
  test('Android blocked-for-good: an instant refusal opens Settings instead of a dead tap', async () => {
    mockPermission = { status: 'denied', canAskAgain: true };
    mockAnswer = { status: 'denied', canAskAgain: false };
    const tree = await render(<NotificationsBanner />);

    await pressButton(tree, 'Turn on');
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain('Notifications are off');
  });

  test('a "Don\'t allow" answered in the dialog is respected (no Settings)', async () => {
    mockPermission = { status: 'denied', canAskAgain: true };
    mockAnswer = { status: 'denied', canAskAgain: false };
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(4_000); // 3s in the dialog
    const tree = await render(<NotificationsBanner />);

    await pressButton(tree, 'Turn on');
    now.mockRestore();
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });

  test('turned on in Settings: back in the app it hides and finishes the setup', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    const tree = await render(<NotificationsBanner />);

    mockPermission = { status: 'granted', canAskAgain: true };
    await act(async () => { foreground(); });
    expect(tree.toJSON()).toBeNull();
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
    expect(scheduleLocalReminders).toHaveBeenCalledTimes(1);
  });

  test('two banners stay in step and the setup runs once', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const first = await render(<NotificationsBanner />);
    const second = await render(<NotificationsBanner />);

    await pressButton(first, 'Turn on');
    expect(second.toJSON()).toBeNull();
    expect(mockRegisterPushDevice).toHaveBeenCalledTimes(1);
  });
});

describe('useNotificationsPrompt (the in-context ask)', () => {
  let api;
  function Harness() {
    api = useNotificationsPrompt();
    return api.prompt;
  }
  const dialog = (tree) => tree.root.findByType(ConfirmDialog);
  // maybeAsk opens the dialog after the save's motion (PROMPT_DELAY_MS).
  const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

  test('asks right after a save while the OS can still prompt', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(<Harness />);

    await act(async () => { expect(await api.maybeAsk()).toBe(true); });
    expect(dialog(tree).props.visible).toBe(false); // not mid-animation
    await act(settle);
    expect(dialog(tree).props.visible).toBe(true);
    expect(dialog(tree).props.title).toBe('Get reminders on this phone?');
  });

  test('"Not now" waits 14 days before asking again', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    const tree = await render(<Harness />);

    await act(async () => { await api.maybeAsk(); });
    await act(settle);
    await act(async () => dialog(tree).props.onCancel());
    expect(mockPrefs.notificationsAskSnoozedUntil).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);

    await act(async () => { expect(await api.maybeAsk()).toBe(false); });
    await act(settle);
    expect(dialog(tree).props.visible).toBe(false);
  });

  test('never asks once allowed, or once the OS can no longer prompt', async () => {
    mockPermission = { status: 'granted', canAskAgain: true };
    await render(<Harness />);
    await act(async () => { expect(await api.maybeAsk()).toBe(false); });

    resetNotificationPermissionForTests();
    mockPermission = { status: 'denied', canAskAgain: false };
    await render(<Harness />);
    await act(async () => { expect(await api.maybeAsk()).toBe(false); });
  });
});
