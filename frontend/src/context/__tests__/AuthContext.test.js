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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { signOut: jest.fn(() => Promise.resolve()) },
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { post, get, request, storeTokens, clearTokens } from '../../services/api';
import { track } from '../../services/analytics';
import { clearSentryUser, setSentryUser } from '../../services/sentry';

// A probe that surfaces the latest context value to the test.
let auth;
function Probe() {
  auth = useAuth();
  return null;
}

async function mount() {
  // loadUser() runs on mount; a rejection leaves the provider logged-out.
  get.mockRejectedValueOnce(new Error('SESSION_EXPIRED'));
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

    // mount() already burned one clearTokens call (SESSION_EXPIRED on load).
    const clearCallsBefore = clearTokens.mock.calls.length;

    await act(async () => {
      await expect(auth.deleteAccount()).rejects.toThrow('Network request failed');
    });

    // No local wipe on failure — the user stays signed in and can retry.
    expect(clearTokens.mock.calls.length).toBe(clearCallsBefore);
    expect(auth.user).toBeTruthy();
  });
});
