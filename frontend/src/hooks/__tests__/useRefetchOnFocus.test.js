// Focus refetch: skipped on the first focus (useQuery already fetched on
// mount), and — for queries with a staleTime — skipped while still fresh,
// because refetch() itself ignores staleTime.
let mockFocusCallbacks = [];
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(cb);
      }, [cb]);
    },
  };
});

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useRefetchOnFocus } from '../useRefetchOnFocus';

function Probe({ refetch, isStale }) {
  useRefetchOnFocus(refetch, isStale === undefined ? undefined : { isStale });
  return null;
}

const focus = () => act(() => mockFocusCallbacks[mockFocusCallbacks.length - 1]());

beforeEach(() => {
  mockFocusCallbacks = [];
});

test('refetches on every focus after the first', () => {
  const refetch = jest.fn();
  act(() => {
    TestRenderer.create(<Probe refetch={refetch} />);
  });
  focus(); // initial focus
  expect(refetch).not.toHaveBeenCalled();
  focus();
  focus();
  expect(refetch).toHaveBeenCalledTimes(2);
});

test('skips the refetch while the query is fresh, refetches once stale', () => {
  const refetch = jest.fn();
  let tree;
  act(() => {
    tree = TestRenderer.create(<Probe refetch={refetch} isStale={false} />);
  });
  focus(); // initial
  focus(); // fresh -> skipped
  expect(refetch).not.toHaveBeenCalled();

  act(() => tree.update(<Probe refetch={refetch} isStale />));
  focus();
  expect(refetch).toHaveBeenCalledTimes(1);
});
