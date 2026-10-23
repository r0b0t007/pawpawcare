import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import { getPref, setPref } from '../services/prefs';
import { FOLLOW_DEVICE_LANGUAGE } from './rollout';
import en from './en.json';
import fr from './fr.json';
import es from './es.json';

// App i18n (CHW-188). English is the default and the fallback for every
// language other than French and Spanish. Translations are formal ("vous",
// "usted") and Spanish follows es-ES. User-entered data (pet names, typed
// breeds, notes, posts) is interpolated as-is, never translated.
//
// Screens import `useTranslation` from here (not from react-i18next) so the
// instance is always initialised before the first t() call.
//
// Hermes ships Intl.DateTimeFormat but not Intl.PluralRules: there i18next
// falls back to its built-in one/other rule, which is what en and es use for
// every count, and fr for every count but 0.

export { useTranslation };

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es'];
/**
 * What the Language setting can hold: follow the device, or a fixed language.
 * 'device' is only offered once device detection is rolled out (./rollout).
 */
export const LANGUAGE_CHOICES = FOLLOW_DEVICE_LANGUAGE ? ['device', ...SUPPORTED_LANGUAGES] : [...SUPPORTED_LANGUAGES];
export const LANGUAGE_PREF = 'language';
/** The device language code last seen, to notice when the phone's language changes. */
export const DEVICE_SEEN_PREF = 'languageDeviceSeen';
const DEFAULT_CHOICE = FOLLOW_DEVICE_LANGUAGE ? 'device' : 'en';

// The Intl locale each language formats dates with. en stays en-US so English
// dates and times read exactly as they did before i18n.
const INTL_LOCALES = { en: 'en-US', fr: 'fr-FR', es: 'es-ES' };

const supported = (code) => (SUPPORTED_LANGUAGES.includes(code) ? code : null);

/** The device's first language if the app speaks it, else English. */
export function deviceLanguage() {
  try {
    return supported(getLocales()?.[0]?.languageCode) ?? 'en';
  } catch {
    return 'en';
  }
}

// The language shown before (or without) a fixed choice: the device's while
// detection is rolled out, English until then.
const startLanguage = () => (FOLLOW_DEVICE_LANGUAGE ? deviceLanguage() : 'en');
const normalizeChoice = (c) => (LANGUAGE_CHOICES.includes(c) ? c : DEFAULT_CHOICE);

let choice = DEFAULT_CHOICE;
const resolveChoice = (c) => (c === 'device' ? startLanguage() : supported(c) ?? startLanguage());

// The device's own first language code, any language (not only the ones the
// app speaks): a phone going from German to English is a change too.
function rawDeviceLanguage() {
  try {
    return getLocales()?.[0]?.languageCode ?? null;
  } catch {
    return null;
  }
}

let deviceSeen = null;

// Latest change wins (CHW-189). The phone has its own per-app language setting
// for PawPawCare (Android 13+, iOS Settings) next to Profile → Language. When
// the device language changes after a fixed choice was made there — the phone's
// language or that per-app setting, which the app sees the same way — the
// setting goes back to "Device default", so the screens follow the app name
// and the system prompts. A choice made in Profile afterwards wins again. The
// first sighting (a fresh install, or the update that added this) only
// records the language. Saving is best-effort, like the rest of the setting.
// `adopt: false` only records it: a choice being made now is the newer change.
function noteDeviceLanguage({ adopt = true } = {}) {
  const now = rawDeviceLanguage();
  if (!FOLLOW_DEVICE_LANGUAGE || now == null || now === deviceSeen) return;
  const changed = adopt && deviceSeen != null && choice !== 'device';
  deviceSeen = now;
  setPref(DEVICE_SEEN_PREF, now).catch(() => {});
  if (changed) {
    choice = 'device';
    setPref(LANGUAGE_PREF, choice).catch(() => {});
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es } },
  lng: startLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false }, // React already escapes
  initAsync: false, // resources are bundled: init synchronously, before any render
  react: { useSuspense: false },
});

/** The language the app is showing right now: 'en' | 'fr' | 'es'. */
export function currentLocale() {
  return supported(i18n.resolvedLanguage) ?? supported(i18n.language) ?? 'en';
}

/** BCP 47 tag for Intl formatting in the current language ('en-US', 'fr-FR', 'es-ES'). */
export function intlLocale() {
  return INTL_LOCALES[currentLocale()];
}

/**
 * The language shown ('en' | 'fr' | 'es'), re-rendering the caller when it
 * changes. Every screen that shows utils/dates output calls it — tabs and
 * stacked screens stay mounted, so without it a language switch would leave
 * their dates and times in the old language — and memos that build date
 * strings list it in their deps.
 */
export function useLocale() {
  useTranslation(); // subscribes to languageChanged
  return currentLocale();
}

/** The saved Language setting: 'device' | 'en' | 'fr' | 'es' ('device' only once rolled out). */
export function languageChoice() {
  return choice;
}

/**
 * Apply and persist a Language setting. The app re-renders in the new
 * language straight away (react-i18next listens to languageChanged).
 * Resolves to the language now shown.
 */
export async function setLanguageChoice(next) {
  noteDeviceLanguage({ adopt: false }); // the device language this choice is made against
  choice = normalizeChoice(next);
  const lng = resolveChoice(choice);
  if (lng !== i18n.language) await i18n.changeLanguage(lng);
  await setPref(LANGUAGE_PREF, choice);
  return lng;
}

let initPromise = null;
let appStateSub = null;

/**
 * Load the saved Language setting (the instance itself is already initialised
 * at import, in the device language once detection is rolled out, else in
 * English). On Android the app is not restarted when the device language
 * changes, so it is re-read whenever the app comes back to the foreground; a
 * change there also ends a fixed choice (noteDeviceLanguage). iOS restarts
 * the app on a language change. Idempotent.
 */
export function initI18n() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [saved, seen] = await Promise.all([getPref(LANGUAGE_PREF, DEFAULT_CHOICE), getPref(DEVICE_SEEN_PREF, null)]);
    choice = normalizeChoice(saved);
    deviceSeen = seen;
    noteDeviceLanguage();
    const lng = resolveChoice(choice);
    if (lng !== i18n.language) await i18n.changeLanguage(lng);
    if (FOLLOW_DEVICE_LANGUAGE && Platform.OS === 'android' && !appStateSub) {
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state !== 'active') return;
        noteDeviceLanguage();
        if (choice !== 'device') return;
        const device = deviceLanguage();
        if (device !== i18n.language) i18n.changeLanguage(device);
      });
    }
    return lng;
  })().catch(() => currentLocale()); // a failed pref read keeps the start language
  return initPromise;
}

export default i18n;
