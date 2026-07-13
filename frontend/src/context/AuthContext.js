import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, post, patch, request, getTokens, storeTokens, clearTokens } from '../services/api';
import {
  registerForPushNotificationsAsync,
  deviceTimezone,
  cancelAllLocalReminders,
} from '../services/notifications';
import { identifyUser, resetAnalytics, track } from '../services/analytics';

const PUSH_TOKEN_KEY = '@pawpawcare/push_token';

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
      dispatch({ type: 'SET_USER', payload: user });
      identifyUser(user); // tie analytics to the restored session
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
      dispatch({ type: 'SET_USER', payload: user });
      identifyUser(user);
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
      const user = await get('/users/me');
      dispatch({ type: 'SET_USER', payload: user });
      identifyUser(user);
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
      const user = await get('/users/me');
      dispatch({ type: 'SET_USER', payload: user });
      identifyUser(user);
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
    try {
      const { refresh } = await getTokens();
      if (refresh) await post('/auth/logout', { refresh_token: refresh }).catch(() => {});
    } catch (_) {}
    await deregisterDevice();
    await clearTokens();
    resetAnalytics(); // clear identity so the next user starts fresh
    dispatch({ type: 'LOGOUT' });
  };

  const updateUser = async (updates) => {
    try {
      const updated = await patch('/users/me', updates);
      dispatch({ type: 'SET_USER', payload: updated });
    } catch (_) {}
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
