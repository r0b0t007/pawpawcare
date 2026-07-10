import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// JWTs live in the OS keychain/keystore on native. SecureStore has no web
// backend, so web falls back to AsyncStorage (localStorage) — same protection
// web apps get anywhere. SecureStore forbids '@' and '/' in keys, hence the
// new names; getTokens() migrates the old AsyncStorage keys once so sessions
// created before this change survive.
const KEYS = {
  ACCESS: 'pawpawcare.access_token',
  REFRESH: 'pawpawcare.refresh_token',
};

const LEGACY_KEYS = {
  ACCESS: '@pawpawcare/access_token',
  REFRESH: '@pawpawcare/refresh_token',
};

const useSecureStore = Platform.OS !== 'web';

const setItem = (key, value) =>
  useSecureStore ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value);

const getItem = (key) =>
  useSecureStore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);

const deleteItem = (key) =>
  useSecureStore ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key);

// Write-through cache: this module is the only writer, so after the first
// disk read every getTokens() is memory-only (keychain IPC is per-call slow,
// and request() calls this on every API hit). Also makes the legacy
// migration single-flight under the startup request fan-out.
let cached = null;
let loadPromise = null;

export async function storeTokens(accessToken, refreshToken) {
  cached = { access: accessToken, refresh: refreshToken };
  await Promise.all([setItem(KEYS.ACCESS, accessToken), setItem(KEYS.REFRESH, refreshToken)]);
}

export async function clearTokens() {
  cached = { access: null, refresh: null };
  await Promise.all([
    deleteItem(KEYS.ACCESS),
    deleteItem(KEYS.REFRESH),
    AsyncStorage.multiRemove([LEGACY_KEYS.ACCESS, LEGACY_KEYS.REFRESH]),
  ]);
}

async function migrateLegacyTokens() {
  const pairs = await AsyncStorage.multiGet([LEGACY_KEYS.ACCESS, LEGACY_KEYS.REFRESH]);
  const [access, refresh] = [pairs[0][1], pairs[1][1]];
  if (access && refresh) {
    await storeTokens(access, refresh);
    await AsyncStorage.multiRemove([LEGACY_KEYS.ACCESS, LEGACY_KEYS.REFRESH]);
    return { access, refresh };
  }
  return null;
}

async function loadTokens() {
  const [access, refresh] = await Promise.all([getItem(KEYS.ACCESS), getItem(KEYS.REFRESH)]);
  if (access || refresh) return { access, refresh };

  // Nothing under the new keys — pick up a session stored before SecureStore.
  const migrated = await migrateLegacyTokens();
  return migrated ?? { access: null, refresh: null };
}

export async function getTokens() {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = loadTokens()
      .then((tokens) => {
        cached = tokens;
        return tokens;
      })
      .finally(() => {
        loadPromise = null; // a failed load retries on the next call
      });
  }
  return loadPromise;
}
