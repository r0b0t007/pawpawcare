// Sheet lifts above the keyboard: it listens only while open and cleans up.
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
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
import { Keyboard, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Sheet from '../Sheet';

const listeners = () => {
  const added = [];
  const removed = [];
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
    const sub = { event, handler, remove: jest.fn(() => removed.push(event)) };
    added.push(sub);
    return sub;
  });
  return { added, removed };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a closed sheet does not listen to the keyboard', () => {
  const { added } = listeners();
  act(() => {
    TestRenderer.create(<Sheet visible={false} onClose={() => {}} title="New vaccine"><Text>form</Text></Sheet>);
  });
  expect(added).toHaveLength(0);
});

test('an open sheet follows the keyboard and stops when it closes', () => {
  const { added, removed } = listeners();
  let tree;
  act(() => {
    tree = TestRenderer.create(<Sheet visible onClose={() => {}} title="New vaccine"><Text>form</Text></Sheet>);
  });
  const events = added.map((s) => s.event);
  expect(events.some((e) => /Show$/.test(e))).toBe(true);
  expect(events.some((e) => /Hide$/.test(e))).toBe(true);

  // Keyboard up then down: neither throws (the lift runs on a shared value).
  act(() => added.find((s) => /Show$/.test(s.event)).handler({ endCoordinates: { height: 300 }, duration: 200 }));
  act(() => added.find((s) => /Hide$/.test(s.event)).handler({ duration: 200 }));

  act(() => tree.update(<Sheet visible={false} onClose={() => {}} title="New vaccine"><Text>form</Text></Sheet>));
  expect(removed).toHaveLength(2);
  act(() => jest.runOnlyPendingTimers()); // AnimatedModal's exit delay
  act(() => tree.unmount());
});
