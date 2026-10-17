// CHW-191: Edit pet reads its strings from i18n. The preview sentence wraps
// the (bold, user-typed) pet name, so each language keeps its own word order
// around it and the name itself is never translated.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
// The real dialog mounts a gesture-handler Sheet (native module); a stub keeps its props.
jest.mock('../../../components/ConfirmDialog', () => function ConfirmDialog() { return null; });
let mockPets = [];
let mockUser = { id: 'u1' };
const mockUpdatePet = jest.fn((id, updates) => Promise.resolve({ id, ...updates }));
const mockDeletePet = jest.fn(() => Promise.resolve(true));
const mockLeavePet = jest.fn(() => Promise.resolve(true));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    pets: mockPets,
    updatePet: mockUpdatePet,
    deletePet: mockDeletePet,
    leavePet: mockLeavePet,
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

const mockNavigation = { goBack: jest.fn(), popToTop: jest.fn() };

function render() {
  let tree;
  act(() => {
    tree = TestRenderer.create(
      <EditPetScreen route={{ params: { petId: 'p1' } }} navigation={mockNavigation} />,
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
  mockLeavePet.mockClear();
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
// 403). The owner gets Remove; a co-owner gets Leave (the profile's action)
// in the same place, so nobody sees a button that can only fail.
describe('the danger zone', () => {
  const dangerButton = (tree, label) => tree.root.findAll((n) => typeof n.type === 'string'
    && n.props.accessibilityRole === 'button' && n.findAllByType(Text).some((x) => flat(x) === label))[0];
  const { ConfirmDialog } = require('../../../components');
  const dialog = (tree) => tree.root.findByType(ConfirmDialog);

  test('the owner removes the pet, after confirming', async () => {
    const tree = render();

    expect(dangerButton(tree, 'Leave this pet')).toBeUndefined();
    act(() => dangerButton(tree, 'Remove Luna').props.onClick?.() ?? dangerButton(tree, 'Remove Luna').props.onPress?.());
    expect(dialog(tree).props.visible).toBe(true);
    expect(dialog(tree).props.title).toBe('Remove Luna?');

    await act(async () => dialog(tree).props.onConfirm());
    expect(mockNavigation.popToTop).toHaveBeenCalled();
    expect(mockDeletePet).toHaveBeenCalledWith('p1');
    expect(mockLeavePet).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('a co-owner gets Leave instead of Remove, with the leave confirmation', async () => {
    mockUser = { id: 'u2' };
    const tree = render();

    expect(dangerButton(tree, 'Remove Luna')).toBeUndefined();
    expect(texts(tree)).toContain('Only the owner can remove Luna. You can stop being a co-owner instead; you\'ll lose access to their records.');
    act(() => dangerButton(tree, 'Leave this pet').props.onPress?.() ?? dangerButton(tree, 'Leave this pet').props.onClick?.());
    expect(dialog(tree).props.title).toBe('Leave pet?');

    await act(async () => dialog(tree).props.onConfirm());
    expect(mockNavigation.popToTop).toHaveBeenCalled();
    expect(mockLeavePet).toHaveBeenCalledWith('p1');
    expect(mockDeletePet).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('owner ids compare as strings, like petById (API ids can be numbers)', () => {
    mockUser = { id: 7 };
    mockPets = [{ ...mockPets[0], ownerId: '7' }];
    const tree = render();

    expect(dangerButton(tree, 'Remove Luna')).toBeDefined();
    act(() => tree.unmount());
  });
});
