import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, post, patch, request, getTokens, storeTokens, clearTokens } from '../services/api';
import {
  registerForPushNotificationsAsync,
  deviceTimezone,
  cancelAllLocalReminders,
} from '../services/notifications';
import { track } from '../services/analytics';
import { identify, resetIdentity } from '../services/identity';
import { cancelPendingReview } from '../services/storeReview';
import { showToast } from '../components/Toast';

const PUSH_TOKEN_KEY = '@pawpawcare/push_token';

// Server-side switches (plan, subscriptions visibility) reach the app through
// /users/me; re-read it when the app comes back to the foreground, at most
// this often.
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;

const AuthContext = createContext(null);

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':    return { ...state, user: action.payload, isLoading: false, error: null };
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_ERROR':   return { ...state, error: action.payload, isLoading: false };
    case 'LOGOUT':      return { user: null, isLoading: false, error: null };
    default:            return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, { user: null, isLoading: true, error: null });

  useEffect(() => { loadUser(); }, []);

  const userRef = useRef(null);
  userRef.current = state.user;
  // Bumped whenever a session ends, so a /users/me response that was in
  // flight for the previous session can never land on the next one.
  const sessionRef = useRef(0);
  const lastRefresh = useRef(0);

  // Every sign-in path and refresh applies the account through here: state,
  // identity (analytics / crash reports / purchases) and the refresh clock.
  const applyUser = (user) => {
    lastRefresh.current = Date.now();
    userRef.current = user;
    dispatch({ type: 'SET_USER', payload: user });
    identify(user);
  };

  const endSession = () => {
    sessionRef.current += 1;
    userRef.current = null;
    cancelPendingReview(); // no rating sheet over the landing screen
  };

  // Re-read the account (plan + feature switches). Resolves the fresh user,
  // or null when the session changed meanwhile; throws on failure. A session
  // that expired is logged out locally (the api client already cleared the
  // tokens), exactly like at app start.
  const refreshUser = useCallback(async () => {
    const session = sessionRef.current;
    let user;
    try {
      user = await get('/users/me');
    } catch (err) {
      if (err?.message === 'SESSION_EXPIRED' && session === sessionRef.current && userRef.current) {
        endSession();
        resetIdentity();
        await clearTokens().catch(() => {});
        dispatch({ type: 'LOGOUT' });
      }
      throw err;
    }
    if (session !== sessionRef.current || !userRef.current || userRef.current.id !== user?.id) {
      return null; // a different session or account by now — drop it
    }
    applyUser(user);
    return user;
  }, []);

  // Apply the { plan, features } POST /users/me/subscription/sync returns,
  // without another round trip (same session/account checks).
  const applyPlan = useCallback(({ plan, features } = {}) => {
    const current = userRef.current;
    if (!current || !plan) return null;
    const user = { ...current, plan, features: features ?? current.features };
    applyUser(user);
    return user;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !userRef.current) return;
      if (Date.now() - lastRefresh.current < FOREGROUND_REFRESH_MS) return;
      refreshUser().catch(() => {});
    });
    return () => sub.remove();
  }, [refreshUser]);

  // Register this device's push token + timezone with the backend so reminders
  // fire at the right local time. Safe to call repeatedly (idempotent upsert).
  const syncDevice = async () => {
    const tz = deviceTimezone();
    // Always tell the server the timezone — needed even when push is unavailable.
    patch('/users/me', { timezone: tz }).catch(() => {});
    try {
      const reg = await registerForPushNotificationsAsync();
      if (reg?.token) {
        await post('/devices', { token: reg.token, platform: reg.platform, timezone: tz }).catch(() => {});
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, reg.token);
      }
    } catch (_) {}
  };

  const deregisterDevice = async () => {
    try {
      const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      if (token) {
        await request('DELETE', '/devices', { token }).catch(() => {});
        await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
      }
    } catch (_) {}
    await cancelAllLocalReminders();
  };

  const loadUser = async () => {
    try {
      const user = await get('/users/me');
      applyUser(user); // tie analytics to the restored session
      syncDevice();
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') await clearTokens();
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const signup = async ({ name, email, password }) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const tokens = await post('/auth/signup', { name, email, password }, { skipAuth: true });
      await storeTokens(tokens.access_token, tokens.refresh_token);
      const user = await get('/users/me');
      applyUser(user);
      track('user_signed_up');
      syncDevice();
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Something went wrong. Please try again.' });
      return false;
    }
  };

  const login = async ({ email, password }) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const tokens = await post('/auth/login', { email, password }, { skipAuth: true });
      await storeTokens(tokens.access_token, tokens.refresh_token);
      // Logging in during the deletion grace period cancels the deletion.
      if (tokens.reactivated) {
        showToast('Welcome back — your account deletion was cancelled.');
      }
      const user = await get('/users/me');
      applyUser(user);
      track('user_logged_in');
      syncDevice();
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Invalid email or password.' });
      return false;
    }
  };

  // Google/Apple sign-in. The screen runs the native provider flow and hands us
  // the resulting token payload; the backend verifies it and returns our own JWT
  // pair, after which the flow is identical to email/password login.
  const socialLogin = async (provider, payload) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const tokens = await post(`/auth/${provider}`, payload, { skipAuth: true });
      await storeTokens(tokens.access_token, tokens.refresh_token);
      // Signing back in during the deletion grace period cancels the deletion.
      if (tokens.reactivated) {
        showToast('Welcome back — your account deletion was cancelled.');
      }
      const user = await get('/users/me');
      applyUser(user);
      // Social auth is find-or-create and the backend doesn't flag which
      // happened, so infer a brand-new account from a just-set created_at to
      // keep the signup funnel accurate (best-effort — analytics only).
      const isNew =
        user?.created_at && Date.now() - new Date(user.created_at).getTime() < 15000;
      track(isNew ? 'user_signed_up' : 'user_logged_in', { method: provider });
      syncDevice();
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Could not sign in. Please try again.' });
      return false;
    }
  };

  const logout = async () => {
    endSession();
    // Grab the refresh token before we wipe local state (needed to revoke it).
    const { refresh } = await getTokens().catch(() => ({ refresh: null }));

    // Best-effort server / device / provider cleanup — all fire-and-forget so a
    // slow or failing network call can neither delay the redirect to the landing
    // screen nor trap the user in a logged-in state if it throws.
    if (refresh) post('/auth/logout', { refresh_token: refresh }).catch(() => {});
    deregisterDevice().catch(() => {});
    resetIdentity(); // clear identity so the next user starts fresh
    try {
      // Clear the native Google session too, so the next sign-in shows the
      // account picker instead of silently reusing the last account. Guarded
      // require mirrors the codebase's defensive native-module pattern.
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.signOut().catch(() => {});
    } catch (_) {}

    // Guaranteed: clear tokens and flip to the landing screen immediately,
    // independent of everything above.
    await clearTokens().catch(() => {});
    dispatch({ type: 'LOGOUT' });
  };

  // Resolves true when saved, false on failure (never throws), so callers
  // with optimistic UI can roll back.
  const updateUser = async (updates) => {
    try {
      const updated = await patch('/users/me', updates);
      dispatch({ type: 'SET_USER', payload: updated });
      return true;
    } catch (_) {
      return false;
    }
  };

  // GDPR account deletion: the server disables the account immediately,
  // revokes every session and push token, and permanently purges the data
  // after a 30-day grace period. Logging back in within that window cancels
  // it. Throws on failure so the caller can surface the error.
  const deleteAccount = async () => {
    const res = await request('DELETE', '/users/me');
    track('account_deletion_requested');
    endSession();

    // Local cleanup mirrors logout(); no /auth/logout or /devices call is
    // needed — the server already revoked everything. Every step is
    // best-effort: the account is already deleted server-side, so nothing
    // may prevent reaching the LOGOUT dispatch below.
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => {});
    await cancelAllLocalReminders().catch(() => {});
    resetIdentity();
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.signOut().catch(() => {});
    } catch (_) {}

    await clearTokens().catch(() => {});
    dispatch({ type: 'LOGOUT' });
    return res; // { status, purge_after }
  };

  // Email ownership: pet invites are addressed by email, so the server only
  // shows/accepts them once the account has confirmed its address with an
  // emailed 6-digit code. Both throw so the caller can surface the error.
  // Resolves to the server status: 'sent', or 'already_verified' when the
  // address was confirmed elsewhere (password reset, social sign-in) — in
  // which case the stored user is refreshed so screens drop the prompt.
  const sendEmailVerification = async () => {
    const res = await post('/users/me/email-verification');
    if (res?.status === 'already_verified') {
      const user = await get('/users/me');
      dispatch({ type: 'SET_USER', payload: user });
    }
    return res?.status;
  };

  const confirmEmailVerification = async (code) => {
    const updated = await post('/users/me/email-verification/confirm', { code });
    dispatch({ type: 'SET_USER', payload: updated });
    return updated;
  };

  const clearError = () => dispatch({ type: 'SET_ERROR', payload: null });

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        // The raw /users/me payload already carries is_admin; surface it as a
        // stable boolean so screens can gate admin-only UI without null checks.
        isAdmin: !!state.user?.is_admin,
        isLoading: state.isLoading,
        error: state.error,
        signup,
        login,
        socialLogin,
        logout,
        updateUser,
        refreshUser,
        applyPlan,
        deleteAccount,
        sendEmailVerification,
        confirmEmailVerification,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
