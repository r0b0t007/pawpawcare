// CHW-191: the pets list reads its strings from i18n. English is unchanged
// (including the one/many subtitle), and in French the chrome is translated
// while pet names stay as typed.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
let mockQuery = {};
jest.mock('../../../hooks/usePetRecords', () => ({
  usePetRecordsQuery: () => ({ data: [], isLoading: false, isError: false, isStale: false, refetch: jest.fn(), ...mockQuery }),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import PetsListScreen from '../PetsListScreen';

const pet = (id, name) => ({ id, name, type: 'cat', color: '#ffddb8', vaccinations: [] });
const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

function render(query) {
  mockQuery = query;
  let tree;
  act(() => {
    tree = TestRenderer.create(<PetsListScreen navigation={{ navigate: jest.fn() }} />);
  });
  return tree;
}

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

test('English copy is unchanged, one pet and many', () => {
  let tree = render({ data: [pet('p1', 'Luna')] });
  expect(texts(tree)).toEqual(expect.arrayContaining(['Your pets', "1 pet · tap to see today's care", 'Add another pet']));
  act(() => tree.unmount());

  tree = render({ data: [pet('p1', 'Luna'), pet('p2', 'Milo')] });
  expect(texts(tree)).toContain("2 pets · tap one to see today's care");
  act(() => tree.unmount());

  tree = render({ data: [] });
  expect(texts(tree)).toEqual(expect.arrayContaining(['No pets yet', 'Add your first pet']));
  act(() => tree.unmount());
});

test('French: chrome translated, pet names untouched', async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  const tree = render({ data: [pet('p1', 'Luna'), pet('p2', 'Milo')] });
  expect(texts(tree)).toEqual(expect.arrayContaining([
    'Vos animaux', '2 animaux · touchez-en un pour voir les soins du jour', 'Luna', 'Milo',
  ]));
  act(() => tree.unmount());
});

// The full records are 1 + 6N requests: a focus re-reads them only once stale.
test('re-reads on focus only once the records are stale', () => {
  const { useRefetchOnFocus } = require('../../../hooks/useRefetchOnFocus');
  const refetch = jest.fn();
  const tree = render({ data: [pet('p1', 'Luna')], isStale: false, refetch });
  expect(useRefetchOnFocus).toHaveBeenCalledWith(refetch, { isStale: false });
  act(() => tree.unmount());
});
