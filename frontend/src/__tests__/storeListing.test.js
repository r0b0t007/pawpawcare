// CHW-195: the App Store (store.config.json, pushed with `eas metadata:push`)
// and Google Play (fastlane/metadata/android/<locale>/) listings in English,
// French and Spanish. The stores reject or truncate text over their limits,
// so every limit and keyword rule is checked here, per language.
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..');
// App Store locale → Google Play folder. Latin America: the App Store serves it
// from es-MX, Google Play from es-419.
const PLAY_DIR = { 'en-US': 'en-US', 'fr-FR': 'fr-FR', 'es-ES': 'es-ES', 'es-MX': 'es-419' };
const LOCALES = Object.keys(PLAY_DIR);
const store = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'store.config.json'), 'utf8'));
const play = (locale, file) =>
  fs.readFileSync(path.join(FRONTEND, 'fastlane', 'metadata', 'android', PLAY_DIR[locale], file), 'utf8').replace(/\n$/, '');
// Apple counts characters, not bytes ("é" is one).
const len = (s) => [...s].length;
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

describe.each(LOCALES)('%s', (locale) => {
  const info = store.apple.info[locale];

  test('App Store: title and subtitle fit (30), promo text (170), description (4000)', () => {
    expect(info).toBeDefined();
    expect(len(info.title)).toBeLessThanOrEqual(30);
    expect(len(info.subtitle)).toBeLessThanOrEqual(30);
    expect(len(info.promoText)).toBeLessThanOrEqual(170);
    expect(len(info.description)).toBeLessThanOrEqual(4000);
    expect(info.title).toMatch(/^PawPawCare\b/);
  });

  // EAS Metadata takes keywords as a list (unique items); App Store Connect
  // joins them with commas into one field of at most 100 characters.
  test('App Store keywords: a unique list within 100 characters, nothing repeated from the title', () => {
    const terms = info.keywords;
    expect(Array.isArray(terms)).toBe(true);
    expect(len(terms.join(','))).toBeLessThanOrEqual(100);
    expect(new Set(terms).size).toBe(terms.length);
    terms.forEach((term) => expect(term).toMatch(/^[^,\s](?:[^,]*[^,\s])?$/));
    // Apple already indexes the title and subtitle, so repeating one of their
    // words wastes space — singular/plural and masculine/feminine included
    // ("veterinario" next to "veterinaria").
    const stem = (w) => w.replace(/(es|s|a|o|e)$/u, '');
    const taken = new Set([...words(info.title), ...words(info.subtitle)].map(stem));
    expect(terms.filter((term) => words(term).some((w) => taken.has(stem(w))))).toEqual([]);
  });

  test('App Store links are https on pawpawcare.app', () => {
    for (const key of ['privacyPolicyUrl', 'supportUrl', 'marketingUrl']) {
      expect(info[key]).toMatch(/^https:\/\/pawpawcare\.app\//);
    }
  });

  test('Google Play: title (30), short description (80), full description (4000)', () => {
    expect(len(play(locale, 'title.txt'))).toBeLessThanOrEqual(30);
    expect(len(play(locale, 'short_description.txt'))).toBeLessThanOrEqual(80);
    expect(len(play(locale, 'full_description.txt'))).toBeLessThanOrEqual(4000);
  });

  test('both stores tell the same story: same title, same full description', () => {
    expect(play(locale, 'title.txt')).toBe(info.title);
    expect(play(locale, 'full_description.txt')).toBe(info.description);
  });
});

test('every App Store locale has a Play listing and the reverse (no orphan folder)', () => {
  expect(Object.keys(store.apple.info).sort()).toEqual(LOCALES.slice().sort());
  const folders = fs.readdirSync(path.join(FRONTEND, 'fastlane', 'metadata', 'android')).sort();
  expect(folders).toEqual(Object.values(PLAY_DIR).sort());
});

test('Latin American Spanish is the Spain copy with Spain-only words swapped', () => {
  const spain = store.apple.info['es-ES'].description;
  const latam = store.apple.info['es-MX'].description;
  expect(latam).not.toMatch(/\bcoste\b/);
  expect(latam).toBe(spain.replace('el coste', 'el costo'));
});
