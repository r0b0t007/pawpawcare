import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useTickAt } from '../useTickAt';

let tick;
function Probe({ times }) {
  tick = useTickAt(times);
  return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('ticks once the earliest future time passes', () => {
  const soon = Date.now() + 5000;
  act(() => { TestRenderer.create(<Probe times={[soon, soon + 60000, Date.now() - 1000]} />); });
  expect(tick).toBe(0);
  act(() => { jest.advanceTimersByTime(4000); });
  expect(tick).toBe(0);
  act(() => { jest.advanceTimersByTime(2500); });
  expect(tick).toBe(1);
});

it('never ticks with nothing in the future', () => {
  act(() => { TestRenderer.create(<Probe times={[Date.now() - 1000]} />); });
  act(() => { jest.advanceTimersByTime(10 * 60000); });
  expect(tick).toBe(0);
});
