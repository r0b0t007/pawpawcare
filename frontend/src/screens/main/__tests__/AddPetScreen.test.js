// CHW-191: Add pet reads its strings from i18n. Breed suggestions are shown
// in the app language but stored in English, so a pet's breed means the same
// thing whichever language it was added in.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/ui/community/datetime-picker', () => () => null);
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../context/DataContext', () => ({ useData: () => ({ addPet: jest.fn() }) }));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import AddPetScreen from '../AddPetScreen';

const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));
const pressable = (tree, label) =>
  tree.root.find((n) => n.props.label === label && typeof n.props.onPress === 'function');

function render() {
  let tree;
  act(() => {
    tree = TestRenderer.create(<AddPetScreen navigation={{ goBack: jest.fn(), replace: jest.fn() }} />);
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
    'Step 1 of 3', 'Who are we caring for?', 'Dog', 'Cat', 'Rabbit, bird or other', 'Continue',
  ]));
  act(() => tree.unmount());
});

test('French: chrome translated; a breed chip shows French but stores English', async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  const tree = render();
  expect(texts(tree)).toEqual(expect.arrayContaining([
    'Étape 1 sur 3', 'De qui allons-nous prendre soin ?', 'Chien', 'Chat',
  ]));

  act(() => pressable(tree, 'Continuer').props.onPress());
  act(() => pressable(tree, 'Croisé').props.onPress());
  const breed = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Race');
  expect(breed.props.value).toBe('Mixed');
  act(() => tree.unmount());
});
