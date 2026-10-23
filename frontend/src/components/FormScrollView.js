import React, { useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

// The scrolling body of a screen with text inputs. It holds the keyboard rules
// every form needs, so a new form screen can't forget one:
// - keyboardShouldPersistTaps="handled": with the keyboard up, a tap on a
//   button presses it (by default the first tap only closes the keyboard).
// - KeyboardAvoidingView: the scroll area ends at the keyboard, so fields and
//   buttons below it can still be scrolled into view.
// - keepVisible (optional): a ref to the form's main button. When the keyboard
//   opens over it, the form scrolls just enough to show it (CHW-154: on
//   Android 15+ the window no longer shrinks for the keyboard, so Login's
//   "Log in" sat under it and a tap there typed a letter into the password).
// Props go to the ScrollView. A screen whose main button is pinned below the
// scroll (AddPet's footer) keeps its own KeyboardAvoidingView around both.

const GAP = 16;

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

export default function FormScrollView({ children, keepVisible, onScroll, ...scrollProps }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!keepVisible) return undefined;
    const sub = Keyboard.addListener('keyboardDidShow', async (e) => {
      const keyboardTop = e?.endCoordinates?.screenY;
      const node = scrollRef.current;
      if (keyboardTop == null || !node) return;
      const [scroll, target, focused] = await Promise.all([
        measure(node),
        measure(keepVisible.current),
        measure(TextInput.State.currentlyFocusedInput?.()),
      ]);
      if (!scroll || !target) return;
      const delta = revealScrollDelta({ keyboardTop, scroll, target, focused });
      if (delta > 0) node.scrollTo({ y: scrollY.current + delta, animated: !reduced });
    });
    return () => sub.remove();
  }, [keepVisible, reduced]);

  const handleScroll = (e) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
