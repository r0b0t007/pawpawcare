// CHW-191: Edit pet reads its strings from i18n. The preview sentence wraps
// the (bold, user-typed) pet name, so each language keeps its own word order
// around it and the name itself is never translated.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
let mockPets = [];
let mockUser = { id: 'u1' };
const mockUpdatePet = jest.fn((id, updates) => Promise.resolve({ id, ...updates }));
const mockDeletePet = jest.fn(() => Promise.resolve(true));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    pets: mockPets,
    updatePet: mockUpdatePet,
    deletePet: mockDeletePet,
  }),
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

import React from 'react';
import { Text, TextInput } from 'react-native';
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

beforeEach(() => {
  // The signed-in user owns Luna unless a test says otherwise.
  mockUser = { id: 'u1' };
  mockPets = [{ id: 'p1', name: 'Luna', type: 'cat', breed: '', color: '#ffddb8', ownerId: 'u1' }];
  mockUpdatePet.mockClear();
  mockDeletePet.mockClear();
});

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

test('French: a suggested breed shows in French and is saved back in English', async () => {
  mockPets = [{ id: 'p1', name: 'Luna', type: 'cat', breed: 'Mixed', color: '#ffddb8' }];
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  const tree = render();
  const breed = () => tree.root.findAllByType(TextInput).find((n) => n.props.value !== undefined && n.props.placeholder === i18n.t('editPet.breedPlaceholder'));
  expect(breed().props.value).toBe('Croisé');

  const save = tree.root.find((n) => n.props.label === i18n.t('editPet.saveChanges') && typeof n.props.onPress === 'function');
  await act(async () => {
    await save.props.onPress();
  });
  expect(mockUpdatePet).toHaveBeenCalledWith('p1', expect.objectContaining({ breed: 'Mixed' }));
  act(() => tree.unmount());
});

// CHW-229: only the owner can delete a pet (the API answers co-owners with
// 403), so a co-owner never gets the Remove button that can only fail.
describe('removing the pet', () => {
  const removeButton = (tree) => tree.root.findAll((n) => n.props.accessibilityRole === 'button'
    && n.findAllByType(Text).some((t) => flat(t) === 'Remove Luna'));

  test('the owner sees the danger zone with Remove', () => {
    const tree = render();

    expect(texts(tree)).toEqual(expect.arrayContaining(['Danger zone', 'Remove Luna']));
    expect(removeButton(tree).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  test('a co-owner gets no Remove button, just a pointer to "Leave this pet"', () => {
    mockUser = { id: 'u2' };
    const tree = render();
    const all = texts(tree);

    expect(all).not.toContain('Danger zone');
    expect(removeButton(tree)).toHaveLength(0);
    expect(all).toContain("Only the owner can remove Luna. To stop co-owning, open Luna's profile and choose “Leave this pet” in the ••• menu.");
    act(() => tree.unmount());
  });

  test('a co-owner can never trigger the delete, even if the dialog were confirmed', () => {
    mockUser = { id: 'u2' };
    const tree = render();
    const { ConfirmDialog } = require('../../../components');
    const dialog = tree.root.findByType(ConfirmDialog);

    expect(dialog.props.visible).toBe(false);
    act(() => dialog.props.onConfirm());
    expect(mockDeletePet).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
