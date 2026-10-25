// Forgot password, code step: Android back / iOS swipe go back to the email
// step like the on-screen arrow, instead of closing the screen and losing
// the code. A deliberate navigation (to Log in after a reset) still leaves.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
jest.mock('../../../services/api', () => ({ post: jest.fn(() => Promise.resolve(null)) }));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import ForgotPasswordScreen from '../ForgotPasswordScreen';

let listeners;
const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  addListener: jest.fn((event, cb) => {
    listeners[event] = cb;
    return () => { delete listeners[event]; };
  }),
};
const texts = (tree) => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  listeners = {};
});
afterEach(() => act(() => tree?.unmount()));

async function toCodeStep() {
  await act(async () => {
    tree = TestRenderer.create(<ForgotPasswordScreen navigation={navigation} />);
  });
  const email = tree.root.findAllByType(TextInput)[0];
  await act(async () => email.props.onChangeText('sam@example.test'));
  const send = tree.root.findAll((n) => n.props.label === 'Send code' && n.props.onPress)[0];
  await act(async () => send.props.onPress());
  expect(texts(tree)).toContain('Check your inbox');
}

const removal = (type) => ({ data: { action: { type } }, preventDefault: jest.fn() });

test('the titles are headings for screen readers', async () => {
  await act(async () => {
    tree = TestRenderer.create(<ForgotPasswordScreen navigation={navigation} />);
  });
  const heading = tree.root.findAll((n) => n.type === Text && n.props.accessibilityRole === 'header')[0];
  expect([].concat(heading.props.children).join('')).toBe('Reset your password');
});

test('hardware back on the code step returns to the email step', async () => {
  await toCodeStep();
  const e = removal('GO_BACK');
  await act(async () => listeners.beforeRemove(e));

  expect(e.preventDefault).toHaveBeenCalled();
  expect(texts(tree)).toContain('Reset your password');
});

test('a deliberate navigation away is not blocked', async () => {
  await toCodeStep();
  const e = removal('NAVIGATE');
  await act(async () => listeners.beforeRemove(e));
  expect(e.preventDefault).not.toHaveBeenCalled();
});

test('on the email step, back leaves the screen as usual', async () => {
  await act(async () => {
    tree = TestRenderer.create(<ForgotPasswordScreen navigation={navigation} />);
  });
  expect(listeners.beforeRemove).toBeUndefined();
});

test('speaks French when the app does', async () => {
  const i18n = require('../../../i18n').default;
  await act(async () => { await i18n.changeLanguage('fr'); });
  try {
    await act(async () => {
      tree = TestRenderer.create(<ForgotPasswordScreen navigation={navigation} />);
    });
    expect(texts(tree)).toContain('Réinitialiser votre mot de passe');
  } finally {
    await act(async () => { await i18n.changeLanguage('en'); });
  }
});

// #195: the code is bound to the request that asked for it, so the reset
// sends back the newest request's ID.
test('the reset sends the request ID of the newest code', async () => {
  const { post } = require('../../../services/api');
  post
    .mockResolvedValueOnce({ status: 'ok', request_id: 'first' })
    .mockResolvedValueOnce({ status: 'ok', request_id: 'second' });
  await toCodeStep();
  expect(post).toHaveBeenLastCalledWith('/auth/forgot-password', { email: 'sam@example.test', bind: true }, { skipAuth: true });

  const resend = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.onPress
    && texts({ root: n }).includes("Didn't get it? Send again"))[0];
  await act(async () => resend.props.onPress());

  const [codeInput, pwd, confirm] = tree.root.findAllByType(TextInput);
  await act(async () => codeInput.props.onChangeText('123456'));
  await act(async () => pwd.props.onChangeText('newpassword99'));
  await act(async () => confirm.props.onChangeText('newpassword99'));
  const submit = tree.root.findAll((n) => n.props.label === 'Reset password' && n.props.onPress)[0];
  await act(async () => submit.props.onPress());

  expect(post).toHaveBeenLastCalledWith(
    '/auth/reset-password',
    { email: 'sam@example.test', code: '123456', password: 'newpassword99', request_id: 'second' },
    { skipAuth: true },
  );
});
