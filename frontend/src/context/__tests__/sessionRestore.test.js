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
import { get, getTokens, clearTokens } from '../../services/api';

const USER = { id: 'u1', name: 'E2E Tester', email: 'e2e@example.test', plan: 'free' };
const offline = () => new Error('Network error: Failed to connect');

let auth;
function Probe() {
  auth = useAuth();
  return null;
}

let tree;
async function launch() {
  await act(async () => {
    tree = TestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

// Run out the retry waits (1s, then 3s) with the requests in between.
async function flushRetries() {
  for (let i = 0; i < 4; i += 1) {
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
  it('offers a retry instead of the Welcome screen when the server is unreachable', async () => {
    get.mockRejectedValue(offline());
    await launch();
    await flushRetries();

    expect(get).toHaveBeenCalledTimes(3); // first try + two retries
    expect(auth.user).toBeNull();
    expect(auth.isLoading).toBe(false);
    expect(auth.restoreFailed).toBe(true);
    expect(clearTokens).not.toHaveBeenCalled();
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

  it('shows the Welcome screen when there is no saved session to restore', async () => {
    getTokens.mockResolvedValue({ access: null, refresh: null });
    get.mockRejectedValue(offline());
    await launch();

    expect(get).toHaveBeenCalledTimes(1);
    expect(auth.isLoading).toBe(false);
    expect(auth.restoreFailed).toBe(false);
  });
});
