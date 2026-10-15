import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiny device-local preference store (JSON values on AsyncStorage). Used for
// settings that have no backend representation yet, e.g. the Profile tab's
// notification toggles. Keys in use: 'careReminders', 'communityDigest',
// 'language' (src/i18n: 'device' | 'en' | 'fr' | 'es').

const PREFIX = '@pawpawcare/pref:';

export async function getPref(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function setPref(key, value) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // best-effort — a failed pref write should never break the caller
  }
}
