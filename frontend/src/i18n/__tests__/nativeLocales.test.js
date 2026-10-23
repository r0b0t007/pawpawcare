// Native localization (CHW-189): the languages the system offers in its
// per-app language settings, and the iOS permission prompts translated at
// prebuild. They are native, so a gap here only shows on a fresh build: these
// checks catch it in Jest instead.
const fs = require('fs');
const path = require('path');

const { SUPPORTED_LANGUAGES } = require('..');
const app = require('../../../app.json').expo;
const fingerprint = require('../../../fingerprint.config.js');

const FRONTEND = path.join(__dirname, '../../..');
const TRANSLATED = SUPPORTED_LANGUAGES.filter((l) => l !== 'en');

const pluginName = (p) => (Array.isArray(p) ? p[0] : p);
const pluginOptions = (name) => {
  const entry = app.plugins.find((p) => pluginName(p) === name);
  return (Array.isArray(entry) && entry[1]) || {};
};
const localeFile = (lng) => JSON.parse(fs.readFileSync(path.join(FRONTEND, app.locales[lng]), 'utf8'));

// Config plugins checked for the iOS permission prompts they add (with
// `npx expo config --type introspect`, 2026-10-23). Only expo-image-picker and
// expo-secure-store add any, each switchable below. A plugin that is not on
// this list fails the test until someone has looked at what it declares.
const REVIEWED_PLUGINS = [
  'expo-font',
  'expo-notifications',
  'expo-image-picker',
  'expo-localization',
  'expo-status-bar',
  'expo-splash-screen',
  'expo-secure-store',
  'expo-sharing',
  'expo-apple-authentication',
  '@react-native-google-signin/google-signin',
  '@sentry/react-native/expo',
];

// The iOS prompts those plugins put in Info.plist: each one is on unless its
// option is `false`.
function declaredPrompts() {
  const picker = pluginOptions('expo-image-picker');
  const store = pluginOptions('expo-secure-store');
  return [
    'NSPhotoLibraryUsageDescription',
    picker.cameraPermission !== false && 'NSCameraUsageDescription',
    picker.microphonePermission !== false && 'NSMicrophoneUsageDescription',
    store.faceIDPermission !== false && 'NSFaceIDUsageDescription',
  ].filter(Boolean);
}

// The first word of each translated prompt: formal command, right language.
const OPENING = { fr: /^Autorisez /, es: /^Permita /u };
// Informal pronouns, letter-aware (`\b` treats "ú" as a non-word character).
// The informal commands ("Autorise", "Permite") are ruled out by OPENING: the
// same words are also correct formal third-person forms ("le permite").
const word = (list) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'iu');
const INFORMAL = { fr: word('tu|ton|ta|tes|toi'), es: word('tú|tu|te|tus') };

describe('native localization', () => {
  it('offers every app language in the system per-app language settings', () => {
    const { supportedLocales } = pluginOptions('expo-localization');
    expect(supportedLocales.ios).toEqual(SUPPORTED_LANGUAGES);
    expect(supportedLocales.android).toEqual(SUPPORTED_LANGUAGES);
  });

  it('declares no camera, microphone or Face ID access: the app only reads the photo library', () => {
    // The store privacy forms (docs/store-privacy-disclosures.md) list photos only.
    expect(pluginOptions('expo-image-picker')).toMatchObject({ cameraPermission: false, microphonePermission: false });
    expect(pluginOptions('expo-secure-store')).toMatchObject({ faceIDPermission: false });
    expect(Object.keys(app.ios.infoPlist ?? {}).filter((k) => k.endsWith('UsageDescription'))).toEqual([]);
  });

  it('only uses config plugins that were checked for permission prompts', () => {
    expect(app.plugins.map(pluginName).filter((name) => !REVIEWED_PLUGINS.includes(name))).toEqual([]);
  });

  it('has a native locale file for every translated language, and no other', () => {
    expect(Object.keys(app.locales).sort()).toEqual([...TRANSLATED].sort());
  });

  it.each(TRANSLATED)('%s translates exactly the prompts the plugins declare', (lng) => {
    // No app name: both platforms then fall back to `name`, so the e2e build's
    // "PawPawCare (E2E)" (app.config.js) shows in every language too.
    expect(localeFile(lng)).toEqual({ ios: expect.any(Object) });
    expect(Object.keys(localeFile(lng).ios).sort()).toEqual(declaredPrompts().sort());
  });

  it.each(TRANSLATED)('%s prompts are in that language, in the formal tone of the glossary', (lng) => {
    Object.values(localeFile(lng).ios).forEach((text) => {
      expect(text).toMatch(OPENING[lng]);
      expect(text).toContain('PawPawCare');
      expect(text).not.toMatch(INFORMAL[lng]);
    });
  });

  it('hashes the locale files into the runtime fingerprint', () => {
    // The fingerprint only sees the paths in app.json; a wording change must
    // still move the runtime, like any other native change.
    expect(fingerprint.extraSources).toContainEqual(expect.objectContaining({ type: 'dir', filePath: 'locales' }));
  });
});
