// Language detection and the Language setting (CHW-188): fr/es devices get
// their language, everything else English; a saved choice wins over the
// device; on Android the device language is re-read on return to foreground
// while the setting follows the device.
//
// Detection is switched on in ./rollout since CHW-191 (every screen is
// translated). Off is the kill switch: the app then starts in English and only
// an explicit choice changes it. Both modes are covered; `follow` picks one
// per test (default: on, as shipped).
let mockFollowDevice = true;
jest.mock('../rollout', () => ({
  get FOLLOW_DEVICE_LANGUAGE() {
    return mockFollowDevice;
  },
}));
let mockDeviceLanguage = 'en';
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockDeviceLanguage }],
}));
const mockPrefs = {};
jest.mock('../../services/prefs', () => ({
  getPref: jest.fn((key, fallback) => Promise.resolve(key in mockPrefs ? mockPrefs[key] : fallback)),
  setPref: jest.fn((key, value) => {
    mockPrefs[key] = value;
    return Promise.resolve();
  }),
}));

const { AppState, Platform } = require('react-native');

// A fresh i18n module per test (it initialises at import).
function load({ device = 'en', saved, os = 'android', follow = true } = {}) {
  mockFollowDevice = follow;
  mockDeviceLanguage = device;
  Object.keys(mockPrefs).forEach((k) => delete mockPrefs[k]);
  if (saved !== undefined) mockPrefs.language = saved;
  Platform.OS = os;
  let mod;
  jest.isolateModules(() => {
    mod = require('..');
  });
  return mod;
}

let appStateListener;
beforeEach(() => {
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
    appStateListener = fn;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

test.each([
  ['fr', 'fr', 'fr-FR'],
  ['es', 'es', 'es-ES'],
  ['en', 'en', 'en-US'],
  ['de', 'en', 'en-US'], // any other language falls back to English
  ['pt', 'en', 'en-US'],
])('a %s device starts in %s', (device, expected, tag) => {
  const { currentLocale, intlLocale, default: i18n } = load({ device });
  expect(currentLocale()).toBe(expected);
  expect(intlLocale()).toBe(tag);
  expect(i18n.t('languages.device')).toBeTruthy();
});

test('device-language detection ships switched on', () => {
  expect(jest.requireActual('../rollout').FOLLOW_DEVICE_LANGUAGE).toBe(true);
});

test('with nothing saved, the setting is "Device default" and it is offered first', async () => {
  const { initI18n, LANGUAGE_CHOICES, languageChoice, currentLocale } = load({ device: 'fr' });
  expect(LANGUAGE_CHOICES).toEqual(['device', 'en', 'fr', 'es']);
  expect(await initI18n()).toBe('fr');
  expect(languageChoice()).toBe('device');
  expect(currentLocale()).toBe('fr');
});

test('a saved language wins over the device language', async () => {
  const { initI18n, currentLocale, languageChoice } = load({ device: 'fr', saved: 'es' });
  expect(await initI18n()).toBe('es');
  expect(currentLocale()).toBe('es');
  expect(languageChoice()).toBe('es');
});

test('an unknown saved value means "follow the device"', async () => {
  const { initI18n, languageChoice } = load({ device: 'fr', saved: 'klingon' });
  expect(await initI18n()).toBe('fr');
  expect(languageChoice()).toBe('device');
});

test('setLanguageChoice switches at once and saves the choice', async () => {
  const { initI18n, setLanguageChoice, currentLocale } = load({ device: 'en' });
  await initI18n();
  expect(await setLanguageChoice('fr')).toBe('fr');
  expect(currentLocale()).toBe('fr');
  expect(mockPrefs.language).toBe('fr');
  expect(await setLanguageChoice('device')).toBe('en');
  expect(mockPrefs.language).toBe('device');
});

test('on Android, coming back to the foreground picks up a new device language', async () => {
  const { initI18n, setLanguageChoice, currentLocale } = load({ device: 'en' });
  await initI18n();
  expect(appStateListener).toEqual(expect.any(Function));

  mockDeviceLanguage = 'es';
  appStateListener('background');
  expect(currentLocale()).toBe('en');
  appStateListener('active');
  await Promise.resolve();
  expect(currentLocale()).toBe('es');

  // A fixed choice is never overridden by the device.
  await setLanguageChoice('fr');
  mockDeviceLanguage = 'en';
  appStateListener('active');
  await Promise.resolve();
  expect(currentLocale()).toBe('fr');
});

test('iOS restarts the app on a language change, so no listener there', async () => {
  const { initI18n } = load({ device: 'en', os: 'ios' });
  await initI18n();
  expect(appStateListener).toBeNull();
});

describe('with detection switched off (FOLLOW_DEVICE_LANGUAGE false, the kill switch)', () => {
  test.each(['fr', 'es', 'de'])('a %s device still starts in English', async (device) => {
    const { initI18n, currentLocale, intlLocale, languageChoice } = load({ device, follow: false });
    expect(currentLocale()).toBe('en');
    expect(intlLocale()).toBe('en-US');
    expect(await initI18n()).toBe('en');
    expect(languageChoice()).toBe('en');
  });

  test('"Device default" is not offered, and a saved "device" reads as English', async () => {
    const { initI18n, LANGUAGE_CHOICES, languageChoice, currentLocale } = load({ device: 'fr', saved: 'device', follow: false });
    expect(LANGUAGE_CHOICES).toEqual(['en', 'fr', 'es']);
    expect(await initI18n()).toBe('en');
    expect(languageChoice()).toBe('en');
    expect(currentLocale()).toBe('en');
  });

  test('an explicit choice still switches the app, and is kept', async () => {
    const { initI18n, setLanguageChoice, currentLocale } = load({ device: 'en', saved: 'es', follow: false });
    expect(await initI18n()).toBe('es');
    expect(currentLocale()).toBe('es');
    expect(await setLanguageChoice('fr')).toBe('fr');
    expect(mockPrefs.language).toBe('fr');
  });

  test('the device language is never re-read on Android', async () => {
    const { initI18n } = load({ device: 'en', follow: false });
    await initI18n();
    expect(appStateListener).toBeNull();
  });
});
