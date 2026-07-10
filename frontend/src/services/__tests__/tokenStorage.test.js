const NEW_ACCESS = 'pawpawcare.access_token';
const NEW_REFRESH = 'pawpawcare.refresh_token';
const LEGACY_ACCESS = '@pawpawcare/access_token';
const LEGACY_REFRESH = '@pawpawcare/refresh_token';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiRemove: jest.fn(),
}));

// The module holds a write-through cache, so every test gets a fresh copy.
let SecureStore;
let AsyncStorage;
let tokenStorage;

function freshModules({ platform = 'ios' } = {}) {
  jest.resetModules();
  require('react-native').Platform.OS = platform;
  SecureStore = require('expo-secure-store');
  AsyncStorage = require('@react-native-async-storage/async-storage');

  // Defaults: everything empty, writes succeed.
  SecureStore.getItemAsync.mockResolvedValue(null);
  SecureStore.setItemAsync.mockResolvedValue(undefined);
  SecureStore.deleteItemAsync.mockResolvedValue(undefined);
  AsyncStorage.getItem.mockResolvedValue(null);
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.removeItem.mockResolvedValue(undefined);
  AsyncStorage.multiGet.mockResolvedValue([[LEGACY_ACCESS, null], [LEGACY_REFRESH, null]]);
  AsyncStorage.multiRemove.mockResolvedValue(undefined);

  tokenStorage = require('../tokenStorage');
}

const secureValues = (map) =>
  SecureStore.getItemAsync.mockImplementation((key) => Promise.resolve(map[key] ?? null));

const legacyValues = (access, refresh) =>
  AsyncStorage.multiGet.mockResolvedValue([[LEGACY_ACCESS, access], [LEGACY_REFRESH, refresh]]);

beforeEach(() => freshModules());

describe('getTokens', () => {
  it('returns the pair stored under the new keys', async () => {
    secureValues({ [NEW_ACCESS]: 'acc', [NEW_REFRESH]: 'ref' });

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: 'acc', refresh: 'ref' });
    expect(AsyncStorage.multiGet).not.toHaveBeenCalled(); // no migration attempt
  });

  it('returns nulls when nothing is stored anywhere', async () => {
    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: null, refresh: null });
  });

  it('migrates a full legacy session: returns it, writes new keys, removes old ones', async () => {
    legacyValues('old-acc', 'old-ref');

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: 'old-acc', refresh: 'old-ref' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(NEW_ACCESS, 'old-acc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(NEW_REFRESH, 'old-ref');
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([LEGACY_ACCESS, LEGACY_REFRESH]);
  });

  it('does not migrate a half legacy pair', async () => {
    legacyValues('old-acc', null);

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: null, refresh: null });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('reads the backend once, then serves from the cache', async () => {
    secureValues({ [NEW_ACCESS]: 'acc', [NEW_REFRESH]: 'ref' });

    await tokenStorage.getTokens();
    await tokenStorage.getTokens();
    await tokenStorage.getTokens();

    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2); // one per key, once total
  });

  it('shares a single load between concurrent first calls (migration runs once)', async () => {
    legacyValues('old-acc', 'old-ref');

    const [a, b] = await Promise.all([tokenStorage.getTokens(), tokenStorage.getTokens()]);

    expect(a).toEqual({ access: 'old-acc', refresh: 'old-ref' });
    expect(b).toEqual(a);
    expect(AsyncStorage.multiGet).toHaveBeenCalledTimes(1);
  });

  it('retries the load on the next call after a failure', async () => {
    SecureStore.getItemAsync
      .mockRejectedValueOnce(new Error('keychain busy'))
      .mockRejectedValueOnce(new Error('keychain busy'));

    await expect(tokenStorage.getTokens()).rejects.toThrow('keychain busy');

    secureValues({ [NEW_ACCESS]: 'acc', [NEW_REFRESH]: 'ref' });
    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: 'acc', refresh: 'ref' });
  });
});

describe('storeTokens / clearTokens', () => {
  it('storeTokens primes the cache — no backend read needed afterwards', async () => {
    await tokenStorage.storeTokens('acc', 'ref');

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: 'acc', refresh: 'ref' });
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(NEW_ACCESS, 'acc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(NEW_REFRESH, 'ref');
  });

  it('clearTokens empties the cache and both storage generations', async () => {
    await tokenStorage.storeTokens('acc', 'ref');
    await tokenStorage.clearTokens();

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: null, refresh: null });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(NEW_ACCESS);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(NEW_REFRESH);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([LEGACY_ACCESS, LEGACY_REFRESH]);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled(); // cleared state is cached too
  });
});

describe('on web', () => {
  it('uses AsyncStorage instead of SecureStore', async () => {
    freshModules({ platform: 'web' });
    AsyncStorage.getItem.mockImplementation((key) =>
      Promise.resolve({ [NEW_ACCESS]: 'acc', [NEW_REFRESH]: 'ref' }[key] ?? null),
    );

    await expect(tokenStorage.getTokens()).resolves.toEqual({ access: 'acc', refresh: 'ref' });
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();

    await tokenStorage.storeTokens('a2', 'r2');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(NEW_ACCESS, 'a2');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
