import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Only the launch-time session restore (loadUser) is under test, so every
// side-effecting collaborator is stubbed (same set as AuthContext.test.js).
jest.mock('../../services/api', () => ({
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(() => Promise.resolve()),
  request: jest.fn(() => Promise.resolve()),
  getTokens: jest.fn(),
  storeTokens: jest.fn(() => Promise.resolve()),
  clearTokens: jest.fn(() => Promise.resolve()),
  storePendingLogout: jest.fn(() => Promise.resolve()),
  getPendingLogout: jest.fn(() => Promise.resolve(null)),
  clearPendingLogout: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(() => Promise.resolve(null)),
  deviceTimezone: jest.fn(() => 'UTC'),
  cancelAllLocalReminders: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/analytics', () => ({
  identifyUser: jest.fn(),
  resetAnalytics: jest.fn(),
  track: jest.fn(),
}));
jest.mock('../../services/sentry', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}));
jest.mock('../../services/purchases', () => ({
  shouldUsePurchases: jest.requireActual('../../services/purchases').shouldUsePurchases,
  loginPurchases: jest.fn(() => Promise.resolve(true)),
  logoutPurchases: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { signOut: jest.fn(() => Promise.resolve()) },
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { get, patch, getTokens, clearTokens } from '../../services/api';
import * as i18nModule from '../../i18n';

const USER = { id: 'u1', name: 'E2E Tester', email: 'e2e@example.test', plan: 'free' };
const offline = () => Object.assign(new Error('Network error: Failed to connect'), { isNetworkError: true });
const serverError = () => Object.assign(new Error('Request failed (503)'), { status: 503 });

let auth;
function Probe() {
  auth = useAuth();
  return null;
}

let tree;
let localeSpy;
async function launch() {
  await act(async () => {
    tree = TestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

// Run out the retry wait (2s) with the requests around it.
async function flushRetries() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
  }
}

describe('session restore at launch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getTokens.mockResolvedValue({ access: 'a', refresh: 'r' });
  });

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    jest.useRealTimers();
    localeSpy?.mockRestore();
    localeSpy = undefined;
    patch.mockImplementation(() => Promise.resolve());
  });

  it('restores the user when /users/me answers', async () => {
    get.mockResolvedValue(USER);
    await launch();

    expect(auth.user).toEqual(USER);
    expect(auth.isLoading).toBe(false);
    expect(auth.restoreFailed).toBe(false);
  });

  // Seen on the emulator: a slow server made /users/me time out at launch and
  // the app showed the Welcome screen, as if signed out, with the session
  // still saved.
  // The account was saved in English, the app shows French: the sign-in
  // sync saves 'fr', and the user must carry it so DataContext refetches the
  // server-translated groups (they may have been fetched in English meanwhile).
  it('stores the locale the sign-in sync saved on the restored user', async () => {
    localeSpy = jest.spyOn(i18nModule, 'currentLocale').mockReturnValue('fr');
    get.mockResolvedValue({ ...USER, locale: 'en' });
    patch.mockImplementation((path, body) => Promise.resolve({ ...USER, ...body }));
    await launch();

    expect(patch).toHaveBeenCalledWith('/users/me', expect.objectContaining({ locale: 'fr' }));
    expect(auth.user.locale).toBe('fr');
    expect(auth.user.plan).toBe('free');
  });

  it('ignores a sync answer for a different account', async () => {
    localeSpy = jest.spyOn(i18nModule, 'currentLocale').mockReturnValue('fr');
    get.mockResolvedValue({ ...USER, locale: 'en' });
    patch.mockResolvedValue({ ...USER, id: 'someone-else', locale: 'fr' });
    await launch();

    expect(patch).toHaveBeenCalled();
    expect(auth.user.locale).toBe('en');
  });

  it('offers a retry instead of the Welcome screen when the server is unreachable', async () => {
    get.mockRejectedValue(offline());
    await launch();
    await flushRetries();

    expect(get).toHaveBeenCalledTimes(2); // first try + one retry
    expect(auth.user).toBeNull();
    expect(auth.isLoading).toBe(false);
    expect(auth.restoreFailed).toBe(true);
    expect(auth.restoreOffline).toBe(true);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  // The server answered, so "check your connection" would be wrong.
  it('tells a server error apart from no connection', async () => {
    get.mockRejectedValue(serverError());
    await launch();
    await flushRetries();

    expect(auth.restoreFailed).toBe(true);
    expect(auth.restoreOffline).toBe(false);
  });

  it('recovers on a retry without showing the reconnect screen', async () => {
    get.mockRejectedValueOnce(offline()).mockResolvedValue(USER);
    await launch();
    await flushRetries();

    expect(auth.user).toEqual(USER);
    expect(auth.restoreFailed).toBe(false);
  });

  it('signs in once "Try again" reaches the server', async () => {
    get.mockRejectedValue(offline());
    await launch();
    await flushRetries();
    expect(auth.restoreFailed).toBe(true);

    get.mockReset().mockResolvedValue(USER);
    await act(async () => {
      auth.retryRestore();
    });

    expect(auth.user).toEqual(USER);
    expect(auth.restoreFailed).toBe(false);
  });

  it('signs out when the session itself was rejected', async () => {
    get.mockRejectedValue(new Error('SESSION_EXPIRED'));
    await launch();

    expect(get).toHaveBeenCalledTimes(1);
    expect(clearTokens).toHaveBeenCalled();
    expect(auth.user).toBeNull();
    expect(auth.restoreFailed).toBe(false);
  });

  // No request at all: offline, it would hold the spinner for a whole
  // connect timeout before the Welcome screen.
  it('shows the Welcome screen when there is no saved session to restore', async () => {
    getTokens.mockResolvedValue({ access: null, refresh: null });
    get.mockRejectedValue(offline());
    await launch();

    expect(get).not.toHaveBeenCalled();
    expect(auth.isLoading).toBe(false);
    expect(auth.restoreFailed).toBe(false);
  });
});
