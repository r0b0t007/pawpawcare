// The keyboard rules form screens share: taps pass through to buttons
// (FormScrollView), and a confirm dialog never opens under the keyboard.
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});

import React from 'react';
import { Keyboard, KeyboardAvoidingView, RefreshControl, ScrollView, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import FormScrollView from '../FormScrollView';
import ConfirmDialog from '../ConfirmDialog';

afterEach(() => jest.restoreAllMocks());

describe('FormScrollView', () => {
  // Without it, the first tap on a button with the keyboard up only closes
  // the keyboard (seen on Community → Post and the email-code Confirm).
  it('lets taps reach buttons while the keyboard is up, inside a keyboard-avoiding view', () => {
    let tree;
    act(() => {
      tree = TestRenderer.create(<FormScrollView><Text>form</Text></FormScrollView>);
    });
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(tree.root.findByType(KeyboardAvoidingView).findByType(ScrollView)).toBe(scroll);
  });

  it('passes the screen props through to the ScrollView', () => {
    const refresh = <RefreshControl refreshing={false} onRefresh={() => {}} />;
    let tree;
    act(() => {
      tree = TestRenderer.create(
        <FormScrollView contentContainerStyle={{ padding: 4 }} refreshControl={refresh}><Text>form</Text></FormScrollView>
      );
    });
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual({ padding: 4 });
    expect(scroll.props.refreshControl).toBe(refresh);
  });
});

describe('ConfirmDialog', () => {
  const dialog = (visible) => (
    <ConfirmDialog visible={visible} title="Mark as found?" onConfirm={() => {}} onCancel={() => {}} />
  );

  it('closes the keyboard when it opens, so its buttons are not covered', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    let tree;
    act(() => {
      tree = TestRenderer.create(dialog(false));
    });
    expect(dismiss).not.toHaveBeenCalled();

    act(() => tree.update(dialog(true)));
    expect(dismiss).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
