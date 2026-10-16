// expo-font (via @expo/vector-icons) requires expo-asset, which isn't a
// dependency of this app — icons don't render in Jest anyway.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AppErrorBoundary from '../AppErrorBoundary';

let shouldThrow = true;
function Screen() {
  if (shouldThrow) throw new Error('render failed');
  return <Text>Dashboard</Text>;
}

const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

test('shows the crash screen on a render error and recovers on "Try again"', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const onReset = jest.fn(); // App.js clears the React Query cache here
  let tree;
  act(() => {
    tree = TestRenderer.create(
      <AppErrorBoundary onReset={onReset}>
        <Screen />
      </AppErrorBoundary>,
    );
  });

  expect(texts(tree)).toContain('Something went wrong');
  expect(texts(tree).join(' ')).toContain('hello@pawpawcare.app');
  expect(texts(tree)).not.toContain('Dashboard');

  shouldThrow = false;
  const tryAgain = tree.root.findAll((n) => n.props.label === 'Try again' && n.props.onPress)[0];
  act(() => tryAgain.props.onPress());

  expect(texts(tree)).toContain('Dashboard');
  expect(onReset).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});

test('the crash screen speaks French when the app does', async () => {
  const i18n = require('../../i18n').default;
  await i18n.changeLanguage('fr');
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  shouldThrow = true;
  let tree;
  try {
    act(() => {
      tree = TestRenderer.create(
        <AppErrorBoundary>
          <Screen />
        </AppErrorBoundary>,
      );
    });
    expect(texts(tree)).toContain('Une erreur est survenue');
    expect(texts(tree).join(' ')).toContain('hello@pawpawcare.app');
  } finally {
    act(() => tree?.unmount());
    spy.mockRestore();
    await i18n.changeLanguage('en');
  }
});
