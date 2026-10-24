import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  get, post, patch, request, getTokens, storeTokens, clearTokens,
  storePendingLogout, getPendingLogout, clearPendingLogout,
} from '../services/api';
import {
  registerForPushNotificationsAsync,
  deviceTimezone,
  cancelAllLocalReminders,
} from '../services/notifications';
import { track } from '../services/analytics';
import { identify, resetIdentity } from '../services/identity';
import { cancelPendingReview } from '../services/storeReview';
import { showToast } from '../components/Toast';
import i18n, { currentLocale } from '../i18n';

const PUSH_TOKEN_KEY = '@pawpawcare/push_token';

// Server-side switches (plan, subscriptions visibility) reach the app through
// /users/me; re-read it when the app comes back to the foreground, at most
// this often.
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;

// Restoring a saved session at launch: waits before each retry when the server
// can't be reached, before offering "Try again". One retry: on Android a
// hanging server costs ~10s per attempt (OkHttp's connect timeout), measured
// on the emulator at ~30s of spinner with two.
const RESTORE_RETRY_MS = [2000];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const AuthContext = createContext(null);

// isLoading is the saved-session restore at launch: AppNavigator shows a
// full-screen spinner for it. A sign-in attempt (email, signup, Google/Apple)
// is authBusy instead, so the sign-in screens stay mounted while it runs: on a
// failure (wrong password, email taken, offline) the user stays on the form
// and sees the error, instead of the whole auth stack remounting at Welcome.
function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':       return { ...state, user: action.payload, isLoading: false, authBusy: false, error: null, restoreFailed: false };
    case 'SET_LOADING':    return { ...state, isLoading: action.payload };
    case 'AUTH_START':     return { ...state, authBusy: true, error: null };
    case 'SET_ERROR':      return { ...state, error: action.payload, isLoading: false, authBusy: false };
    case 'CLEAR_ERROR':    return { ...state, error: null };
    case 'RESTORE_FAILED': return { ...state, isLoading: false, restoreFailed: true, restoreOffline: action.payload };
    case 'RESTORE_RETRY':  return { ...state, isLoading: true, restoreFailed: false };
    case 'LOGOUT':         return { user: null, isLoading: false, authBusy: false, error: null, restoreFailed: false };
    default:               return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null, isLoading: true, authBusy: false, error: null, restoreFailed: false, restoreOffline: false,
  });

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

  // Tell the server about a sign-out: revoke the refresh token and unregister
  // this phone's push token (POST /auth/logout needs no access token). Kept
  // until the server has it — a sign-out made offline is resent on the next
  // launch or sign-in, or the server keeps pushing that account's reminders
  // to this phone. Never throws.
  const sendLogout = async (pending) => {
    try {
      await storePendingLogout(pending);
      await post('/auth/logout', pending, { skipAuth: true });
      await clearPendingLogout();
    } catch (err) {
      // A 4xx other than rate limiting won't succeed on a resend.
      if (err?.status >= 400 && err.status < 500 && err.status !== 429) {
        await clearPendingLogout().catch(() => {});
      }
    }
  };

  // Single-flight: launch and a quick sign-in can both resend it.
  const pendingLogoutRef = useRef(null);
  const flushPendingLogout = () => {
    if (!pendingLogoutRef.current) {
      pendingLogoutRef.current = getPendingLogout()
        .catch(() => null)
        .then((pending) => pending && sendLogout(pending))
        .finally(() => { pendingLogoutRef.current = null; });
    }
    return pendingLogoutRef.current;
  };

  // Register this device's push token + timezone with the backend so reminders
  // fire at the right local time. Safe to call repeatedly (idempotent upsert).
  const syncDevice = async () => {
    const session = sessionRef.current;
    // An earlier sign-out still unregisters this phone first, so it can't
    // remove the registration made below.
    await flushPendingLogout();
    const tz = deviceTimezone();
    // Always tell the server the timezone and the app language — needed even
    // when push is unavailable (reminder times, server-sent pushes and email).
    // The saved locale goes back on the user: content the server translates
    // (the seeded community groups) may have been fetched in the old language
    // meanwhile, and useGroupsQuery keys them on user.locale. Only
    // the locale is taken, so a plan applied meanwhile is never undone; and
    // only while the app still shows it, so a language picked in Profile
    // since this PATCH went out wins. Not via applyUser: this is no account
    // refresh, so the refresh clock and identity stay as they are.
    patch('/users/me', { timezone: tz, locale: currentLocale() })
      .then((saved) => {
        const current = userRef.current;
        if (session !== sessionRef.current || !current || current.id !== saved?.id) return;
        if (!saved.locale || saved.locale === current.locale || saved.locale !== currentLocale()) return;
        const next = { ...current, locale: saved.locale };
        userRef.current = next;
        dispatch({ type: 'SET_USER', payload: next });
      })
      .catch(() => {});
    await registerPushDevice(tz);
  };

  // Register this phone for server pushes, if notifications are allowed. It
  // never shows the permission prompt (CHW-230): the app asks in context, and
  // useNotificationPermission calls this again once permission is granted.
  const registerPushDevice = async (tz = deviceTimezone()) => {
    try {
      const reg = await registerForPushNotificationsAsync();
      if (reg?.token) {
        await post('/devices', { token: reg.token, platform: reg.platform, timezone: tz }).catch(() => {});
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, reg.token);
        // A sign-out still waiting to be sent (its resend failed in
        // syncDevice) must not unregister the phone just registered.
        const pending = await getPendingLogout().catch(() => null);
        if (pending?.device_token === reg.token) {
          await storePendingLogout({ ...pending, device_token: null });
        }
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

  // Launch: restore the saved session. Only a rejected session signs out.
  // Offline, a timeout or a server error leaves the tokens valid, and falling
  // through to the Welcome screen read as being signed out — so retry
  // briefly, then show "Try again" (restoreFailed) instead.
  const loadUser = async () => {
    flushPendingLogout();
    // Never signed in (no saved session): the Welcome screen is right, and
    // without a request an offline first launch doesn't wait on a timeout.
    const { refresh } = await getTokens().catch(() => ({ refresh: null }));
    if (!refresh) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }

    let user;
    for (let attempt = 0; !user; attempt += 1) {
      try {
        user = await get('/users/me');
      } catch (err) {
        if (err.message === 'SESSION_EXPIRED') {
          await clearTokens();
          dispatch({ type: 'SET_LOADING', payload: false });
          return;
        }
        if (attempt >= RESTORE_RETRY_MS.length) {
          dispatch({ type: 'RESTORE_FAILED', payload: !!err.isNetworkError });
          return;
        }
        await wait(RESTORE_RETRY_MS[attempt]);
      }
    }
    // Outside the retry: only the request can fail for want of a connection.
    applyUser(user); // tie analytics to the restored session
    syncDevice();
  };

  const retryRestore = () => {
    dispatch({ type: 'RESTORE_RETRY' });
    loadUser();
  };

  // Coming back to the app (e.g. after turning wifi on) retries on its own.
  useEffect(() => {
    if (!state.restoreFailed) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') retryRestore();
    });
    return () => sub.remove();
  }, [state.restoreFailed]);

  // One sign-in at a time (email, signup, Google/Apple): the form stays on
  // screen while it runs, so a second one could otherwise start alongside it
  // (Return on the password field, the Google button, a retry). A second
  // attempt is turned away (false) without touching the first.
  const attemptRunning = useRef(false);
  const runAttempt = async (failedKey, attempt) => {
    if (attemptRunning.current) return false;
    attemptRunning.current = true;
    dispatch({ type: 'AUTH_START' });
    try {
      await attempt();
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || i18n.t(failedKey) });
      return false;
    } finally {
      attemptRunning.current = false;
    }
  };

  // Store the new session, then load the account. If loading it fails, the
  // session is dropped again: the user sees the error and stays signed out,
  // rather than holding a session the next launch would silently restore.
  const startSession = async (tokens) => {
    await storeTokens(tokens.access_token, tokens.refresh_token);
    try {
      return await get('/users/me');
    } catch (err) {
      await clearTokens().catch(() => {});
      throw err;
    }
  };

  const signup = ({ name, email, password }) =>
    runAttempt('errors.signupFailed', async () => {
      const tokens = await post('/auth/signup', { name, email, password }, { skipAuth: true });
      const user = await startSession(tokens);
      applyUser(user);
      track('user_signed_up');
      syncDevice();
    });

  const login = ({ email, password }) =>
    runAttempt('errors.loginFailed', async () => {
      const tokens = await post('/auth/login', { email, password }, { skipAuth: true });
      const user = await startSession(tokens);
      // Logging in during the deletion grace period cancels the deletion.
      if (tokens.reactivated) {
        showToast(i18n.t('auth.reactivated'));
      }
      applyUser(user);
      track('user_logged_in');
      syncDevice();
    });

  // Google/Apple sign-in. The screen runs the native provider flow and hands us
  // the resulting token payload; the backend verifies it and returns our own JWT
  // pair, after which the flow is identical to email/password login.
  const socialLogin = (provider, payload) =>
    runAttempt('errors.socialFailed', async () => {
      const tokens = await post(`/auth/${provider}`, payload, { skipAuth: true });
      const user = await startSession(tokens);
      // Signing back in during the deletion grace period cancels the deletion.
      if (tokens.reactivated) {
        showToast(i18n.t('auth.reactivated'));
      }
      applyUser(user);
      // Social auth is find-or-create and the backend doesn't flag which
      // happened, so infer a brand-new account from a just-set created_at to
      // keep the signup funnel accurate (best-effort — analytics only).
      const isNew =
        user?.created_at && Date.now() - new Date(user.created_at).getTime() < 15000;
      track(isNew ? 'user_signed_up' : 'user_logged_in', { method: provider });
      syncDevice();
    });

  const loggingOut = useRef(false);
  const logout = async () => {
    if (loggingOut.current) return; // a double tap signs out once
    loggingOut.current = true;
    try {
      await signOut();
    } finally {
      loggingOut.current = false;
    }
  };

  const signOut = async () => {
    endSession();
    // Grab the refresh and push tokens before we wipe local state (needed to
    // revoke the session and unregister this phone).
    const { refresh } = await getTokens().catch(() => ({ refresh: null }));
    const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => null);

    // Best-effort server / device / provider cleanup — all fire-and-forget so a
    // slow or failing network call can neither delay the redirect to the landing
    // screen nor trap the user in a logged-in state if it throws.
    if (refresh) sendLogout({ refresh_token: refresh, device_token: pushToken });
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

  // Only the message: a sign-in still running stays busy.
  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        // The raw /users/me payload already carries is_admin; surface it as a
        // stable boolean so screens can gate admin-only UI without null checks.
        isAdmin: !!state.user?.is_admin,
        isLoading: state.isLoading,
        // A sign-in, signup or Google/Apple sign-in is running.
        authBusy: state.authBusy,
        // A saved session couldn't be checked (offline / server down):
        // AppNavigator shows ReconnectScreen instead of the Welcome screen.
        restoreFailed: state.restoreFailed,
        restoreOffline: state.restoreOffline,
        retryRestore,
        error: state.error,
        signup,
        login,
        socialLogin,
        logout,
        updateUser,
        refreshUser,
        // Signed-in only: there's no account to attach the phone to otherwise.
        // A sign-out still being resent goes first (as in syncDevice), so its
        // DELETE /devices can't remove the registration made here.
        registerPushDevice: async () => {
          if (!state.user) return;
          await flushPendingLogout();
          await registerPushDevice();
        },
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
