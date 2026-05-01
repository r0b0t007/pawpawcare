import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, post, patch, storeTokens, clearTokens } from '../services/api';

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

  const loadUser = async () => {
    try {
      const user = await get('/users/me');
      dispatch({ type: 'SET_USER', payload: user });
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
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Invalid email or password.' });
      return false;
    }
  };

  const logout = async () => {
    try {
      const { refresh } = await AsyncStorage.multiGet(['@pawpawcare/refresh_token'])
        .then((p) => ({ refresh: p[0][1] }));
      if (refresh) await post('/auth/logout', { refresh_token: refresh }).catch(() => {});
    } catch (_) {}
    await clearTokens();
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
      value={{ user: state.user, isLoading: state.isLoading, error: state.error, signup, login, logout, updateUser, clearError }}
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
