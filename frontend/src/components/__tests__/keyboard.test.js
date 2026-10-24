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
import { NavigationContext } from '@react-navigation/native';
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

  // A FormScrollView with a button ref and a stubbed native layout: the
  // keyboard's own handlers are captured, the ScrollView's host methods mocked.
  async function mountForm({ navigation, buttonY = 1513, measureLater = false } = {}) {
    const handlers = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      (handlers[event] = handlers[event] || []).push(fn);
      return { remove: jest.fn() };
    });
    const later = [];
    const measureInWindow = (rect) => (cb) => (measureLater ? later.push(() => cb(...rect)) : cb(...rect));
    const button = { current: { measureInWindow: measureInWindow([0, buttonY, 1000, 80]) } };
    const form = <FormScrollView keepVisible={button}><Text>form</Text></FormScrollView>;
    let tree;
    act(() => {
      tree = TestRenderer.create(navigation ? <NavigationContext.Provider value={navigation}>{form}</NavigationContext.Provider> : form);
    });
    const scroll = tree.root.findByType(ScrollView);
    scroll.instance.measureInWindow = measureInWindow([0, 0, 1080, 2400]);
    scroll.instance.scrollTo = jest.fn();
    const showKeyboard = (screenY = 1381) =>
      act(async () => (handlers.keyboardDidShow || []).forEach((fn) => fn({ endCoordinates: { screenY } })));
    return { tree, scroll, scrollTo: scroll.instance.scrollTo, showKeyboard, flushMeasures: () => later.splice(0).forEach((f) => f()) };
  }
  const keyboardUp = (screenY) => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(screenY != null);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue(screenY != null ? { screenY, height: 2400 - screenY } : undefined);
  };

  it('scrolls by that much from where the form is when the keyboard opens', async () => {
    const { tree, scroll, scrollTo, showKeyboard } = await mountForm();
    act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 40 } } }));
    await showKeyboard();
    expect(scrollTo).toHaveBeenCalledWith({ y: 40 + 1513 + 80 + 16 - 1381, animated: true });
    act(() => tree.unmount());
  });

  it('reveals it again when the content changes while the keyboard is up (an error line, a taller step)', async () => {
    keyboardUp(1381);
    const { tree, scroll, scrollTo } = await mountForm();
    await act(async () => scroll.props.onContentSizeChange(1080, 2600));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // And after the scroll area itself changes (KeyboardAvoidingView shrinking it).
    await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 1381 } } }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it('leaves the form alone when the content changes with the keyboard down', async () => {
    keyboardUp(null);
    const { tree, scroll, scrollTo } = await mountForm();
    await act(async () => scroll.props.onContentSizeChange(1080, 2600));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('a screen below in the stack ignores the keyboard', async () => {
    const { tree, scrollTo, showKeyboard } = await mountForm({ navigation: { isFocused: () => false } });
    await showKeyboard();
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('does not scroll a form that went away while it was measuring', async () => {
    const { tree, scrollTo, showKeyboard, flushMeasures } = await mountForm({ measureLater: true });
    await showKeyboard();
    act(() => tree.unmount());
    await act(async () => flushMeasures());
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing without keepVisible, and adds no scroll tracking', async () => {
    const handlers = [];
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, fn) => {
      if (event === 'keyboardDidShow') handlers.push(fn);
      return { remove: jest.fn() };
    });
    let tree;
    act(() => {
      tree = TestRenderer.create(<FormScrollView><Text>form</Text></FormScrollView>);
    });
    const scroll = tree.root.findByType(ScrollView);
    scroll.instance.scrollTo = jest.fn();
    await act(async () => handlers.forEach((fn) => fn({ endCoordinates: { screenY: 1381 } })));
    expect(scroll.instance.scrollTo).not.toHaveBeenCalled();
    expect(scroll.props.scrollEventThrottle).toBeUndefined();
    expect(scroll.props.onScroll).toBeUndefined();
    act(() => tree.unmount());
  });
});

// Every form screen names its main button, so a new one can't forget the
// keyboard rule (CHW-154): a FormScrollView without keepVisible fails here.
describe('form screens', () => {
  const fs = require('fs');
  const path = require('path');
  const SCREENS = path.join(__dirname, '../../screens');
  const files = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === '__tests__' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);

  it.each(files(SCREENS).filter((f) => fs.readFileSync(f, 'utf8').includes('<FormScrollView')).map((f) => [path.relative(SCREENS, f), f]))(
    '%s passes keepVisible to every FormScrollView',
    (_, file) => {
      const source = fs.readFileSync(file, 'utf8');
      const tags = source.split('<FormScrollView').slice(1).map((rest) => rest.slice(0, rest.indexOf('>')));
      tags.forEach((tag) => expect(tag).toMatch(/keepVisible=\{/));
    },
  );
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
