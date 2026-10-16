// CHW-191: Edit pet reads its strings from i18n. The preview sentence wraps
// the (bold, user-typed) pet name, so each language keeps its own word order
// around it and the name itself is never translated.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    pets: [{ id: 'p1', name: 'Luna', type: 'cat', breed: '', color: '#ffddb8' }],
    updatePet: jest.fn(),
    deletePet: jest.fn(),
  }),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import EditPetScreen from '../EditPetScreen';

// A Text's full string, nested Texts included.
const flat = (node) => (node.children || []).map((c) => (typeof c === 'string' ? c : flat(c))).join('');
const texts = (tree) => tree.root.findAllByType(Text).map(flat);

function render() {
  let tree;
  act(() => {
    tree = TestRenderer.create(
      <EditPetScreen route={{ params: { petId: 'p1' } }} navigation={{ goBack: jest.fn(), popToTop: jest.fn() }} />,
    );
  });
  return tree;
}

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

test('English copy is unchanged', () => {
  const tree = render();
  expect(texts(tree)).toEqual(expect.arrayContaining([
    'Edit Luna', 'This is how Luna will appear across the app.', 'Cat', 'Remove Luna', 'Breed (optional)',
  ]));
  act(() => tree.unmount());
});

test('French: chrome and species labels translated, the name kept as typed', async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  const tree = render();
  expect(texts(tree)).toEqual(expect.arrayContaining([
    'Modifier Luna', "Voici comment Luna apparaîtra dans l'application.", 'Chat', 'Supprimer Luna',
  ]));
  act(() => tree.unmount());
});
