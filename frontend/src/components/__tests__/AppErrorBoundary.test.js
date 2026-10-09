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
  let tree;
  act(() => {
    tree = TestRenderer.create(
      <AppErrorBoundary>
        <Screen />
      </AppErrorBoundary>,
    );
  });

  expect(texts(tree)).toContain('Something went wrong');
  expect(texts(tree)).not.toContain('Dashboard');

  shouldThrow = false;
  const tryAgain = tree.root.findAll((n) => n.props.label === 'Try again' && n.props.onPress)[0];
  act(() => tryAgain.props.onPress());

  expect(texts(tree)).toContain('Dashboard');
  spy.mockRestore();
});
