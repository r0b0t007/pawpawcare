// Welcome, Log in and Sign up read their copy from src/i18n: English stays
// exactly as it was, and the screens follow the app language.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => false }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('../../../services/observe', () => ({ useObserve: () => ({ markInteractive: () => {} }) }));
jest.mock('../../../components/SocialAuthButtons', () => () => null);
const mockAuth = { signup: jest.fn(), login: jest.fn(), error: null, isLoading: false, clearError: jest.fn() };
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import WelcomeScreen from '../WelcomeScreen';
import LoginScreen from '../LoginScreen';
import SignupScreen from '../SignupScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const texts = (tree) => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
const button = (tree, label) => tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === 'function')[0];

let tree;
async function render(Screen) {
  await act(async () => {
    tree = TestRenderer.create(<Screen navigation={navigation} />);
  });
  return tree;
}
afterEach(() => act(() => tree?.unmount()));

describe('in English', () => {
  it('Welcome', async () => {
    await render(WelcomeScreen);
    expect(texts(tree)).toEqual(expect.arrayContaining([
      'PawPawCare',
      'Pet health, made gentle',
      'Every wag and whisker,\ncared for.',
      'Get started',
      'I already have an account',
    ]));
  });

  it('Log in, with its missing-fields hint', async () => {
    await render(LoginScreen);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Welcome back', 'New here? Create an account']));
    await act(async () => button(tree, 'Log in').props.onPress());
    expect(texts(tree)).toContain('Add your email and password to log in.');
  });

  it('Sign up, with its password rules', async () => {
    await render(SignupScreen);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Create your account', '6+ characters', 'Passwords match']));
    expect(button(tree, 'Create account')).toBeTruthy();
  });
});

describe('in French', () => {
  beforeEach(async () => {
    await act(async () => { await i18n.changeLanguage('fr'); });
  });
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('Welcome', async () => {
    await render(WelcomeScreen);
    expect(texts(tree)).toContain('Commencer');
  });

  it('Log in', async () => {
    await render(LoginScreen);
    expect(texts(tree)).toContain('Bon retour parmi nous');
    await act(async () => button(tree, 'Se connecter').props.onPress());
    expect(texts(tree)).toContain('Saisissez votre e-mail et votre mot de passe pour vous connecter.');
  });

  it('Sign up', async () => {
    await render(SignupScreen);
    expect(texts(tree)).toContain('6 caractères minimum');
    expect(button(tree, 'Créer un compte')).toBeTruthy();
  });
});
