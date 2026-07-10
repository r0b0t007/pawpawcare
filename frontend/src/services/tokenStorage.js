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

export async function storeTokens(accessToken, refreshToken) {
  await Promise.all([setItem(KEYS.ACCESS, accessToken), setItem(KEYS.REFRESH, refreshToken)]);
}

export async function clearTokens() {
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

export async function getTokens() {
  const [access, refresh] = await Promise.all([getItem(KEYS.ACCESS), getItem(KEYS.REFRESH)]);
  if (access || refresh) return { access, refresh };

  // Nothing under the new keys — pick up a session stored before SecureStore.
  const migrated = await migrateLegacyTokens();
  return migrated ?? { access: null, refresh: null };
}
