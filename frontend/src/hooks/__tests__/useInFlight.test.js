import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useInFlight } from '../useInFlight';

let api;
function Probe() {
  api = useInFlight();
  return null;
}

it('ignores a second run for the same key while the first is in flight', async () => {
  act(() => { TestRenderer.create(<Probe />); });
  let resolve;
  const fn = jest.fn(() => new Promise((r) => { resolve = r; }));
  let first;
  await act(async () => {
    first = api.run('a', fn);
    api.run('a', fn);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(api.isBusy('a')).toBe(true);
  await act(async () => { resolve('done'); await first; });
  expect(api.isBusy('a')).toBe(false);
  await act(async () => { api.run('a', () => Promise.resolve()); });
});

it('lets different keys run side by side', async () => {
  act(() => { TestRenderer.create(<Probe />); });
  const fn = jest.fn(() => Promise.resolve());
  await act(async () => {
    await Promise.all([api.run('a', fn), api.run('b', fn)]);
  });
  expect(fn).toHaveBeenCalledTimes(2);
});
