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

const localizationPlugin = app.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-localization');
const localeFile = (lng) => JSON.parse(fs.readFileSync(path.join(FRONTEND, app.locales[lng]), 'utf8'));

describe('native localization', () => {
  it('offers every app language in the system per-app language settings', () => {
    const { supportedLocales } = localizationPlugin[1];
    expect(supportedLocales.ios).toEqual(SUPPORTED_LANGUAGES);
    expect(supportedLocales.android).toEqual(SUPPORTED_LANGUAGES);
  });

  it('has a native locale file for every translated language, and no other', () => {
    expect(Object.keys(app.locales).sort()).toEqual([...TRANSLATED].sort());
  });

  it.each(TRANSLATED)('%s translates the app name and the photo prompt', (lng) => {
    const { ios, android } = localeFile(lng);
    expect(ios.CFBundleDisplayName).toBe(app.name);
    expect(android.app_name).toBe(app.name);
    expect(ios.NSPhotoLibraryUsageDescription).toContain('PawPawCare');
    expect(ios.NSPhotoLibraryUsageDescription).not.toBe(
      app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker')[1].photosPermission,
    );
  });

  it('translates the same prompts in every language', () => {
    const [first, ...rest] = TRANSLATED.map((lng) => Object.keys(localeFile(lng).ios).sort());
    rest.forEach((keys) => expect(keys).toEqual(first));
  });

  it('keeps the formal tone of the glossary', () => {
    const fr = Object.values(localeFile('fr').ios).join(' ');
    const es = Object.values(localeFile('es').ios).join(' ');
    expect(fr).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
    expect(es).not.toMatch(/\b(tú|tu|te|tus)\b/i);
  });

  it('hashes the locale files into the runtime fingerprint', () => {
    // The fingerprint only sees the paths in app.json; a wording change must
    // still move the runtime, like any other native change.
    expect(fingerprint.extraSources).toContainEqual(expect.objectContaining({ type: 'dir', filePath: 'locales' }));
  });
});
