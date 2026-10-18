// CHW-195: the App Store (store.config.json, pushed with `eas metadata:push`)
// and Google Play (fastlane/metadata/android/<locale>/) listings in English,
// French and Spanish. The stores reject or truncate text over their limits,
// so every limit and keyword rule is checked here, per language.
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..');
const LOCALES = ['en-US', 'fr-FR', 'es-ES'];
const store = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'store.config.json'), 'utf8'));
const play = (locale, file) =>
  fs.readFileSync(path.join(FRONTEND, 'fastlane', 'metadata', 'android', locale, file), 'utf8').replace(/\n$/, '');
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

  test('App Store keywords: one list within 100 characters, commas only, nothing repeated', () => {
    expect(info.keywords).toHaveLength(1);
    const [list] = info.keywords;
    expect(len(list)).toBeLessThanOrEqual(100);
    expect(list).not.toMatch(/,\s|\s,/);
    const terms = list.split(',');
    expect(new Set(terms).size).toBe(terms.length);
    // Apple already indexes the title and subtitle: repeating a word wastes space.
    const taken = new Set([...words(info.title), ...words(info.subtitle)]);
    expect(terms.filter((term) => words(term).some((w) => taken.has(w)))).toEqual([]);
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
