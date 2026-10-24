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
const mockAuth = { signup: jest.fn(), login: jest.fn(), error: null, authBusy: false, clearError: jest.fn() };
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import WelcomeScreen from '../WelcomeScreen';
import LoginScreen from '../LoginScreen';
import SignupScreen from '../SignupScreen';
import FormScrollView from '../../../components/FormScrollView';

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
    // One toggle reveals both password fields.
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Show passwords').length).toBeGreaterThan(0);
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
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Afficher les mots de passe').length).toBeGreaterThan(0);
  });
});

describe('while a sign-in is running', () => {
  afterEach(() => { mockAuth.authBusy = false; });

  it.each([
    [LoginScreen, 'Log in', 'login'],
    [SignupScreen, 'Create account', 'signup'],
  ])('started elsewhere: %p stays labelled as is, disabled, and starts nothing', async (Screen, label, action) => {
    mockAuth.authBusy = true;
    mockAuth[action].mockClear();
    await render(Screen);
    // Filled in, so only the busy guard can stop it (not the missing-fields hint).
    await act(async () => {
      tree.root.findAll((n) => n.type === TextInput).forEach((f) =>
        f.props.onChangeText(f.props.secureTextEntry ? 'Passw0rd!x' : f.props.keyboardType === 'email-address' ? 'a@b.c' : 'Sam'));
    });
    const own = button(tree, label);
    expect(own.props.disabled).toBe(true);
    await act(async () => own.props.onPress());
    expect(mockAuth[action]).not.toHaveBeenCalled();
  });

  it('started here: Log in says so until it is over', async () => {
    let finish;
    mockAuth.login.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(LoginScreen);
    await act(async () => {
      tree.root.findAll((n) => n.type === TextInput).forEach((f) =>
        f.props.onChangeText(f.props.secureTextEntry ? 'Passw0rd!x' : 'a@b.c'));
    });
    await act(async () => { button(tree, 'Log in').props.onPress(); });
    expect(button(tree, 'Logging in…').props.disabled).toBe(true);
    await act(async () => finish(false));
    expect(button(tree, 'Log in')).toBeDefined();
  });
});

// CHW-154: the main button is the one FormScrollView keeps above the keyboard.
describe('the main button stays above the keyboard', () => {
  it.each([
    [LoginScreen, 'Log in'],
    [SignupScreen, 'Create account'],
  ])('%p', async (Screen, label) => {
    await render(Screen);
    // The ref holds the wrapping View (a mocked component under Jest, so its
    // props are readable); its one child is the screen's main button.
    const target = tree.root.findByType(FormScrollView).props.keepVisible?.current;
    expect(target?.props?.collapsable).toBe(false);
    const child = React.Children.only(target.props.children);
    expect(child.props.label).toBe(label);
    expect(child.props.onPress).toEqual(expect.any(Function));
  });
});
