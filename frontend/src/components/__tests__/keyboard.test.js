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
import FormScrollView, { revealScrollDelta } from '../FormScrollView';
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

describe('FormScrollView keepVisible (CHW-154)', () => {
  // Window rects of the Android emulator's Login with the keyboard up: the
  // keyboard starts at 1381, "Log in" sat at 1513-1593, password at 1262.
  const screen = { keyboardTop: 1381, scroll: { y: 0, height: 2400 } };

  it('scrolls a covered button up to just above the keyboard', () => {
    expect(revealScrollDelta({ ...screen, target: { y: 1513, height: 80 }, focused: { y: 1262, height: 80 } }))
      .toBe(1513 + 80 + 16 - 1381);
  });

  it('leaves a button that already clears the keyboard', () => {
    expect(revealScrollDelta({ ...screen, target: { y: 1200, height: 80 }, focused: null })).toBe(0);
  });

  it('never pushes the focused field above the top of the form', () => {
    expect(revealScrollDelta({ ...screen, target: { y: 2100, height: 80 }, focused: { y: 300, height: 80 } }))
      .toBe(300 - 16);
  });

  it('uses the end of a scroll area the keyboard already shrank (iOS padding)', () => {
    expect(revealScrollDelta({ keyboardTop: 1500, scroll: { y: 0, height: 1400 }, target: { y: 1350, height: 80 }, focused: null }))
      .toBe(1350 + 80 + 16 - 1400);
  });

  it('scrolls by that much from where the form is when the keyboard opens', async () => {
    let onShow;
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      if (event === 'keyboardDidShow') onShow = fn;
      return { remove: jest.fn() };
    });
    const button = { current: { measureInWindow: (cb) => cb(0, 1513, 1000, 80) } };
    let tree;
    act(() => {
      tree = TestRenderer.create(<FormScrollView keepVisible={button}><Text>form</Text></FormScrollView>);
    });
    const scroll = tree.root.findByType(ScrollView);
    const node = scroll.instance;
    node.measureInWindow = (cb) => cb(0, 0, 1080, 2400);
    node.scrollTo = jest.fn();
    act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 40 } } }));

    await act(async () => onShow({ endCoordinates: { screenY: 1381 } }));
    expect(node.scrollTo).toHaveBeenCalledWith({ y: 40 + 1513 + 80 + 16 - 1381, animated: true });
    act(() => tree.unmount());
  });

  it('does nothing without keepVisible', () => {
    const add = jest.spyOn(Keyboard, 'addListener');
    act(() => {
      TestRenderer.create(<FormScrollView><Text>form</Text></FormScrollView>);
    });
    expect(add).not.toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
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
