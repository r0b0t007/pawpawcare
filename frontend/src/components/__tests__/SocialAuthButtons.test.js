// The Google button stays inert while any sign-in runs: the email form stays
// on screen during a login now (it no longer swaps to the launch spinner), so
// the Google button is reachable while that request is in flight.
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Path: View };
});
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  AppleAuthenticationButton: () => null,
  AppleAuthenticationButtonType: {},
  AppleAuthenticationButtonStyle: {},
}));
jest.mock('expo-crypto', () => ({}));
const mockSignIn = jest.fn(() => Promise.resolve({ type: 'success', data: { idToken: 'tok' } }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { hasPlayServices: jest.fn(() => Promise.resolve(true)), signIn: (...a) => mockSignIn(...a) },
  statusCodes: {},
}));
jest.mock('../../config', () => ({ GOOGLE_WEB_CLIENT_ID: 'web-client' }));
jest.mock('../Toast', () => ({ showToast: jest.fn() }));
const mockAuth = { socialLogin: jest.fn(() => Promise.resolve(true)), authBusy: false };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import SocialAuthButtons from '../SocialAuthButtons';

const googleButton = (tree) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === 'Continue with Google' && typeof n.props.onPress === 'function')[0];

async function render() {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<SocialAuthButtons />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.authBusy = false;
});

test('Google signs in when nothing else is running', async () => {
  const tree = await render();
  expect(googleButton(tree).props.disabled).toBe(false);
  await act(async () => googleButton(tree).props.onPress());
  expect(mockAuth.socialLogin).toHaveBeenCalledWith('google', { id_token: 'tok' });
});

test('while an email login runs, Google is disabled and a tap starts nothing', async () => {
  mockAuth.authBusy = true;
  const tree = await render();
  expect(googleButton(tree).props.disabled).toBe(true);
  await act(async () => googleButton(tree).props.onPress());
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(mockAuth.socialLogin).not.toHaveBeenCalled();
});
