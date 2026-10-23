// Native localization (CHW-189): the languages the system offers in its
// per-app language settings, and the translated app name and iOS permission
// prompts baked in at prebuild. They are native, so a gap here only shows on a
// fresh build: these checks catch it in Jest instead.
const fs = require('fs');
const path = require('path');

const { SUPPORTED_LANGUAGES } = require('..');
const app = require('../../../app.json').expo;
const fingerprint = require('../../../fingerprint.config.js');

const FRONTEND = path.join(__dirname, '../../..');
const TRANSLATED = SUPPORTED_LANGUAGES.filter((l) => l !== 'en');

const pluginOptions = (name) => {
  const entry = app.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return (Array.isArray(entry) && entry[1]) || {};
};
const localeFile = (lng) => JSON.parse(fs.readFileSync(path.join(FRONTEND, app.locales[lng]), 'utf8'));

// The iOS prompts the plugins put in Info.plist: each one is on unless its
// option is `false` (expo-image-picker, expo-secure-store).
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
// A letter-aware word boundary: `\b` treats "ú" as a non-word character.
const word = (list) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'iu');
const INFORMAL = {
  fr: word('tu|ton|ta|tes|toi|autorise'),
  es: word('tú|tu|te|tus|permite'),
};

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
  });

  it('has a native locale file for every translated language, and no other', () => {
    expect(Object.keys(app.locales).sort()).toEqual([...TRANSLATED].sort());
  });

  it.each(TRANSLATED)('%s translates the app name and exactly the prompts the plugins declare', (lng) => {
    const { ios, android } = localeFile(lng);
    expect(ios.CFBundleDisplayName).toBe(app.name);
    expect(android.app_name).toBe(app.name);
    expect(Object.keys(ios).sort()).toEqual(['CFBundleDisplayName', ...declaredPrompts()].sort());
  });

  it.each(TRANSLATED)('%s prompts are in that language, in the formal tone of the glossary', (lng) => {
    const { CFBundleDisplayName, ...prompts } = localeFile(lng).ios;
    Object.values(prompts).forEach((text) => {
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

  it('keeps the e2e app name on French and Spanish devices too', () => {
    const before = process.env.ENVIRONMENT;
    process.env.ENVIRONMENT = 'e2e';
    let config;
    jest.isolateModules(() => {
      config = require('../../../app.config.js')({ config: app });
    });
    process.env.ENVIRONMENT = before;

    expect(config.name).toBe('PawPawCare (E2E)');
    TRANSLATED.forEach((lng) => {
      expect(config.locales[lng].ios.CFBundleDisplayName).toBe('PawPawCare (E2E)');
      expect(config.locales[lng].android.app_name).toBe('PawPawCare (E2E)');
      expect(config.locales[lng].ios.NSPhotoLibraryUsageDescription).toBe(localeFile(lng).ios.NSPhotoLibraryUsageDescription);
    });
  });
});
