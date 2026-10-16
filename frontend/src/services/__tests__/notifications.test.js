// CHW-191 review: the Android notification channel name is shown in the
// system settings, so it follows the app language — set on creation and
// renamed (only if it already exists) when the language changes.
jest.mock('expo-constants', () => ({}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('../prefs', () => ({
  getPref: jest.fn((key, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
let mockChannel = null;
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn((id, channel) => {
    mockChannel = { id, ...channel };
    return Promise.resolve(mockChannel);
  }),
  getNotificationChannelAsync: jest.fn(() => Promise.resolve(mockChannel)),
}));

require('react-native').Platform.OS = 'android';
const Notifications = require('expo-notifications');
const i18n = require('../../i18n').default;
const { ensureAndroidChannel } = require('../notifications');

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(async () => {
  await i18n.changeLanguage('en');
  await flush();
  mockChannel = null;
  Notifications.setNotificationChannelAsync.mockClear();
});

test('the channel is created with its name in the app language', async () => {
  await ensureAndroidChannel();
  expect(mockChannel).toEqual(expect.objectContaining({ id: 'reminders', name: 'Reminders' }));

  await i18n.changeLanguage('fr');
  await ensureAndroidChannel();
  expect(mockChannel.name).toBe('Rappels');
});

test('a language change renames an existing channel', async () => {
  await ensureAndroidChannel();
  await i18n.changeLanguage('es');
  await flush();
  expect(mockChannel.name).toBe('Recordatorios');
});

test('a language change never creates the channel', async () => {
  await i18n.changeLanguage('fr');
  await flush();
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(mockChannel).toBeNull();
});
