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
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { post, get, storeTokens } from '../../services/api';
import { track } from '../../services/analytics';

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
