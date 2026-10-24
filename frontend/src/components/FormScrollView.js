import React, { useContext, useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useReducedMotion } from 'react-native-reanimated';

// The scrolling body of a screen with text inputs. It holds the keyboard rules
// every form needs, so a new form screen can't forget one:
// - keyboardShouldPersistTaps="handled": with the keyboard up, a tap on a
//   button presses it (by default the first tap only closes the keyboard).
// - KeyboardAvoidingView: the scroll area ends at the keyboard, so fields and
//   buttons below it can still be scrolled into view.
// - keepVisible: a ref to the form's main button. While the keyboard is up,
//   the form scrolls just enough to show it (CHW-154: on Android 15+ the
//   window no longer shrinks for the keyboard, so Login's "Log in" sat under
//   it and a tap there typed a letter into the password). Every form screen
//   with its main button inside the scroll passes one.
// Props go to the ScrollView. A screen whose main button is pinned below the
// scroll (AddPet's footer) keeps its own KeyboardAvoidingView around both.

const GAP = 16;
// Stands in where @react-navigation/native is mocked without its context.
const NoNavigation = React.createContext(undefined);

/**
 * How far to scroll so `target` clears the keyboard by GAP, without pushing
 * the focused field above the top of the scroll area. All rects are window
 * coordinates ({ y, height }); `focused` may be null. 0 means leave it.
 */
export function revealScrollDelta({ keyboardTop, scroll, target, focused }) {
  const visibleBottom = Math.min(keyboardTop, scroll.y + scroll.height);
  const needed = target.y + target.height + GAP - visibleBottom;
  if (needed <= 0) return 0;
  const room = focused ? focused.y - scroll.y - GAP : needed;
  return Math.max(0, Math.min(needed, room));
}

const measure = (node) =>
  new Promise((resolve) => {
    if (!node?.measureInWindow) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve({ y, height }));
  });

// Where the keyboard starts on screen, or null when it isn't up.
const keyboardTopNow = () => (Keyboard.isVisible?.() ? Keyboard.metrics?.()?.screenY ?? null : null);

export default function FormScrollView({ children, keepVisible, onScroll, onLayout, onContentSizeChange, ...scrollProps }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const reveal = useRef(null);
  // Optional: a form outside a navigator (tests) has no screen focus to check.
  const navigation = useContext(NavigationContext ?? NoNavigation);
  const reduced = useReducedMotion();

  // Revealed when the keyboard opens, and again whenever the form's layout or
  // content changes while it is up: the scroll area shrinking after the
  // keyboard (KeyboardAvoidingView runs on the same event), an error line
  // appearing above the button, a step swapping in a taller form, a growing
  // multiline field. Only the screen in front does it — screens below in the
  // stack stay mounted and hear the same keyboard events.
  useEffect(() => {
    if (!keepVisible) return undefined;
    let alive = true;
    reveal.current = async (keyboardTop = keyboardTopNow()) => {
      const node = scrollRef.current;
      if (keyboardTop == null || !node || navigation?.isFocused?.() === false) return;
      const [scroll, target, focused] = await Promise.all([
        measure(node),
        measure(keepVisible.current),
        measure(TextInput.State.currentlyFocusedInput?.()),
      ]);
      if (!alive || !scroll || !target) return;
      const delta = revealScrollDelta({ keyboardTop, scroll, target, focused });
      if (delta > 0) node.scrollTo({ y: scrollY.current + delta, animated: !reduced });
    };
    const sub = Keyboard.addListener('keyboardDidShow', (e) => reveal.current?.(e?.endCoordinates?.screenY));
    return () => {
      alive = false;
      reveal.current = null;
      sub.remove();
    };
  }, [keepVisible, navigation, reduced]);

  // Scroll tracking only where something reads it.
  const tracking = keepVisible
    ? {
        scrollEventThrottle: 16,
        onScroll: (e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        },
        onLayout: (e) => {
          reveal.current?.();
          onLayout?.(e);
        },
        onContentSizeChange: (w, h) => {
          reveal.current?.();
          onContentSizeChange?.(w, h);
        },
      }
    : { onScroll, onLayout, onContentSizeChange };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...tracking}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
