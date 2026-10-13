import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Mock every side-effecting collaborator so the test exercises only the
// socialLogin control flow (POST → store tokens → load user → track).
jest.mock('../../services/api', () => ({
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(() => Promise.resolve()),
  request: jest.fn(() => Promise.resolve()),
  getTokens: jest.fn(() => Promise.resolve({ access: null, refresh: null })),
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
import {
  post, get, request, getTokens, storeTokens, clearTokens,
  storePendingLogout, getPendingLogout, clearPendingLogout,
} from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '../../services/analytics';
import { clearSentryUser, setSentryUser } from '../../services/sentry';
import { loginPurchases, logoutPurchases } from '../../services/purchases';

// A probe that surfaces the latest context value to the test.
let auth;
function Probe() {
  auth = useAuth();
  return null;
}

async function mount() {
  // loadUser() runs on mount; with no saved tokens it stays logged out.
  await act(async () => {
    TestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthContext.socialLogin', () => {
  it('posts to /auth/{provider}, stores tokens, loads the user', async () => {
    await mount();

    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
    get.mockResolvedValueOnce({ id: 'u1', name: 'Test', created_at: '2000-01-01T00:00:00Z' });

    let result;
    await act(async () => {
      result = await auth.socialLogin('google', { id_token: 'tok' });
    });

    expect(result).toBe(true);
    expect(post).toHaveBeenCalledWith('/auth/google', { id_token: 'tok' }, { skipAuth: true });
    expect(storeTokens).toHaveBeenCalledWith('a', 'r');
    // Old created_at → treated as a returning user, not a signup.
    expect(track).toHaveBeenCalledWith('user_logged_in', { method: 'google' });
    expect(auth.user).toEqual(expect.objectContaining({ id: 'u1' }));
    // Crash reports are tied to the account (Sentry keeps the id only).
    expect(setSentryUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('tracks a signup when the account was just created', async () => {
    await mount();

    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
    get.mockResolvedValueOnce({ id: 'u2', name: 'New', created_at: new Date().toISOString() });

    await act(async () => {
      await auth.socialLogin('apple', { identity_token: 'x', raw_nonce: 'y' });
    });

    expect(track).toHaveBeenCalledWith('user_signed_up', { method: 'apple' });
  });

  it('returns false and surfaces the error when the backend rejects the token', async () => {
    await mount();

    post.mockRejectedValueOnce(new Error('Invalid identity token'));

    let result;
    await act(async () => {
      result = await auth.socialLogin('apple', { identity_token: 'bad', raw_nonce: 'y' });
    });

    expect(result).toBe(false);
    expect(storeTokens).not.toHaveBeenCalled();
    expect(auth.error).toBe('Invalid identity token');
  });
});

describe('AuthContext.logout', () => {
  async function signInThen() {
    await mount();
    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
    get.mockResolvedValueOnce({ id: 'u1', name: 'Test', created_at: '2000-01-01T00:00:00Z' });
    await act(async () => {
      await auth.socialLogin('google', { id_token: 'tok' });
    });
    expect(auth.user).toBeTruthy();
  }

  it('clears the user (returns to the landing screen)', async () => {
    await signInThen();

    await act(async () => {
      await auth.logout();
    });

    expect(auth.user).toBeNull();
    expect(clearSentryUser).toHaveBeenCalled();
  });

  it('still clears the user when a cleanup step rejects', async () => {
    await signInThen();

    // Token wipe fails — the user must still be logged out, not trapped.
    clearTokens.mockRejectedValueOnce(new Error('keychain error'));

    await act(async () => {
      await auth.logout();
    });

    expect(auth.user).toBeNull();
  });

  // Signing out offline (e.g. from the reconnect screen): the server must
  // still hear about it later, or it keeps pushing reminders to this phone.
  describe('telling the server', () => {
    const PENDING = { refresh_token: 'r', device_token: 'ExponentPushToken[x]' };
    const settle = () => act(async () => { await new Promise((r) => setImmediate(r)); });

    beforeEach(() => {
      AsyncStorage.getItem.mockImplementation((key) =>
        Promise.resolve(key === '@pawpawcare/push_token' ? 'ExponentPushToken[x]' : null));
    });
    afterEach(() => {
      AsyncStorage.getItem.mockImplementation(() => Promise.resolve(null));
      getTokens.mockImplementation(() => Promise.resolve({ access: null, refresh: null }));
      post.mockReset();
    });

    async function signOutWith(logoutOutcome) {
      await signInThen();
      getTokens.mockResolvedValue({ access: 'a', refresh: 'r' });
      post.mockImplementation((path) =>
        path === '/auth/logout' ? logoutOutcome() : Promise.resolve(null));
      await act(async () => {
        await auth.logout();
      });
      await settle();
    }

    it('revokes the session and unregisters the phone in one request', async () => {
      await signOutWith(() => Promise.resolve(null));

      expect(post).toHaveBeenCalledWith('/auth/logout', PENDING, { skipAuth: true });
      expect(clearPendingLogout).toHaveBeenCalled();
    });

    it('keeps the sign-out for later when the server is unreachable', async () => {
      await signOutWith(() => Promise.reject(Object.assign(new Error('Network error'), { isNetworkError: true })));

      expect(storePendingLogout).toHaveBeenCalledWith(PENDING);
      expect(clearPendingLogout).not.toHaveBeenCalled();
      expect(auth.user).toBeNull();
    });

    it('resends a kept sign-out on the next launch', async () => {
      getPendingLogout.mockResolvedValueOnce(PENDING);
      post.mockResolvedValueOnce(null);
      await mount();
      await settle();

      expect(post).toHaveBeenCalledWith('/auth/logout', PENDING, { skipAuth: true });
      expect(clearPendingLogout).toHaveBeenCalled();
    });

    it('signs out once on a double tap', async () => {
      await signInThen();
      await act(async () => {
        await Promise.all([auth.logout(), auth.logout()]);
      });

      expect(clearTokens).toHaveBeenCalledTimes(1);
    });
  });
});

describe('AuthContext.deleteAccount', () => {
  async function signInThen() {
    await mount();
    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
    get.mockResolvedValueOnce({ id: 'u1', name: 'Test', created_at: '2000-01-01T00:00:00Z' });
    await act(async () => {
      await auth.socialLogin('google', { id_token: 'tok' });
    });
    expect(auth.user).toBeTruthy();
  }

  it('requests deletion, then clears local state and logs out', async () => {
    await signInThen();

    request.mockResolvedValueOnce({ status: 'deletion_scheduled', purge_after: '2026-08-16T00:00:00Z' });

    let result;
    await act(async () => {
      result = await auth.deleteAccount();
    });

    expect(request).toHaveBeenCalledWith('DELETE', '/users/me');
    expect(track).toHaveBeenCalledWith('account_deletion_requested');
    expect(clearTokens).toHaveBeenCalled();
    expect(auth.user).toBeNull();
    expect(result).toEqual(expect.objectContaining({ status: 'deletion_scheduled' }));
  });

  it('keeps the session when the server call fails', async () => {
    await signInThen();

    request.mockRejectedValueOnce(new Error('Network request failed'));

    const clearCallsBefore = clearTokens.mock.calls.length;

    await act(async () => {
      await expect(auth.deleteAccount()).rejects.toThrow('Network request failed');
    });

    // No local wipe on failure — the user stays signed in and can retry.
    expect(clearTokens.mock.calls.length).toBe(clearCallsBefore);
    expect(auth.user).toBeTruthy();
  });
});

describe('AuthContext subscriptions plumbing', () => {
  it('identifies to RevenueCat only when subscriptions are visible, and forgets on logout', async () => {
    await mount();
    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' });
    get.mockResolvedValueOnce({ id: 'u1', features: { subscriptions_visible: false } });
    await act(async () => {
      await auth.login({ email: 'a@b.c', password: 'x' });
    });
    expect(loginPurchases).not.toHaveBeenCalled();

    // The server flips visibility on; the next refresh picks it up.
    get.mockResolvedValueOnce({ id: 'u1', features: { subscriptions_visible: true } });
    await act(async () => {
      await auth.refreshUser();
    });
    expect(loginPurchases).toHaveBeenCalledWith('u1');
    expect(auth.user.features.subscriptions_visible).toBe(true);

    await act(async () => {
      await auth.logout();
    });
    expect(logoutPurchases).toHaveBeenCalled();
  });

  it('refreshUser does nothing to state when logged out', async () => {
    await mount();
    get.mockResolvedValueOnce({ id: 'u1' });
    await act(async () => {
      await auth.refreshUser();
    });
    expect(auth.user).toBeNull();
  });
});

describe('AuthContext refresh (review fixes)', () => {
  async function signIn(user) {
    post.mockResolvedValueOnce({ access_token: 'a', refresh_token: 'r' });
    get.mockResolvedValueOnce(user);
    await act(async () => {
      await auth.login({ email: 'a@b.c', password: 'x' });
    });
  }

  it('drops a refresh that was in flight for the previous session', async () => {
    await mount();
    await signIn({ id: 'A' });
    let resolveA;
    get.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    let pending;
    act(() => {
      pending = auth.refreshUser();
    });

    await act(async () => {
      await auth.logout();
    });
    await signIn({ id: 'B' });
    await act(async () => {
      resolveA({ id: 'A', plan: { tier: 'plus' } });
      await expect(pending).resolves.toBeNull();
    });

    expect(auth.user.id).toBe('B');
  });

  it('an expired session found on refresh logs out locally', async () => {
    await mount();
    await signIn({ id: 'A' });
    get.mockRejectedValueOnce(new Error('SESSION_EXPIRED'));

    await act(async () => {
      await expect(auth.refreshUser()).rejects.toThrow('SESSION_EXPIRED');
    });

    expect(auth.user).toBeNull();
    expect(clearTokens).toHaveBeenCalled();
    expect(clearSentryUser).toHaveBeenCalled();
  });

  it('switching subscriptions off again logs the account out of RevenueCat', async () => {
    await mount();
    await signIn({ id: 'A', features: { subscriptions_visible: true } });
    expect(loginPurchases).toHaveBeenCalledWith('A');
    logoutPurchases.mockClear();

    get.mockResolvedValueOnce({ id: 'A', features: { subscriptions_visible: false } });
    await act(async () => {
      await auth.refreshUser();
    });

    expect(logoutPurchases).toHaveBeenCalled();
  });

  it('applyPlan merges the sync response without another request', async () => {
    await mount();
    await signIn({ id: 'A', name: 'Sam', plan: { tier: 'free' } });
    get.mockClear();

    await act(async () => {
      auth.applyPlan({ plan: { tier: 'plus', active: true }, features: { subscriptions_visible: true } });
    });

    expect(auth.user).toMatchObject({ id: 'A', name: 'Sam', plan: { tier: 'plus' } });
    expect(get).not.toHaveBeenCalled();
  });
});

