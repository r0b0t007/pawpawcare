// CHW-230: signing in no longer shows the system notification prompt; the app
// asks in context. The permission helpers report whether the OS can still ask.
jest.mock('expo-constants', () => ({}));
jest.mock('expo-device', () => ({ isDevice: true, osName: 'Android' }));
jest.mock('../prefs', () => ({
  getPref: jest.fn((key, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
let mockPermission = { status: 'undetermined', canAskAgain: true };
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve(mockPermission)),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[x]' })),
}));

const Notifications = require('expo-notifications');
const {
  registerForPushNotificationsAsync,
  getNotificationPermission,
  requestNotificationPermission,
} = require('../notifications');

beforeEach(() => {
  mockPermission = { status: 'undetermined', canAskAgain: true };
  jest.clearAllMocks();
});

test('registering at sign-in never shows the system prompt', async () => {
  expect(await registerForPushNotificationsAsync()).toBeNull();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('with permission already granted, registering returns the push token', async () => {
  mockPermission = { status: 'granted', canAskAgain: true };
  expect(await registerForPushNotificationsAsync()).toEqual({ token: 'ExponentPushToken[x]', platform: 'Android' });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('the permission says whether the OS can still prompt', async () => {
  mockPermission = { status: 'denied', canAskAgain: false };
  expect(await getNotificationPermission()).toEqual({ status: 'denied', canAskAgain: false });

  mockPermission = { status: 'denied', canAskAgain: true };
  expect(await getNotificationPermission()).toEqual({ status: 'denied', canAskAgain: true });
});

test('requesting shows the prompt and returns the answer', async () => {
  expect(await requestNotificationPermission()).toEqual({ status: 'granted', canAskAgain: true });
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});
