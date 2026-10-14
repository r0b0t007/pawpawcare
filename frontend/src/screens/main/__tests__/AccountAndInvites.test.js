// Account details and Invitations only confirm what the server actually did:
// a failed save or invite answer says so instead of a success toast.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));

const mockAuth = {};
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
const mockData = {};
jest.mock('../../../context/DataContext', () => ({ useData: () => mockData }));

import React from 'react';
import { TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AccountDetailsScreen from '../AccountDetailsScreen';
import InvitesScreen from '../InvitesScreen';
import { showToast } from '../../../components/Toast';

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const button = (tree, label) => tree.root.findAll((n) => n.props.label === label && n.props.onPress)[0];

let tree;
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => tree?.unmount()));

describe('Account details', () => {
  async function renderWith(updateUser) {
    Object.assign(mockAuth, { user: { name: 'Sam', email: 'sam@example.test' }, updateUser, deleteAccount: jest.fn() });
    await act(async () => {
      tree = TestRenderer.create(<AccountDetailsScreen navigation={navigation} />);
    });
    const input = tree.root.findAllByType(TextInput)[0];
    await act(async () => input.props.onChangeText('Samira'));
    await act(async () => button(tree, 'Save changes').props.onPress());
  }

  it('confirms and closes when the name is saved', async () => {
    await renderWith(jest.fn(() => Promise.resolve(true)));
    expect(showToast).toHaveBeenCalledWith('Saved');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('says so and stays when the save fails', async () => {
    await renderWith(jest.fn(() => Promise.resolve(false)));
    expect(showToast).toHaveBeenCalledWith("Couldn't save your name. Try again.");
    expect(showToast).not.toHaveBeenCalledWith('Saved');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('Invitations', () => {
  const INVITE = { id: 'i1', petName: 'Bella', inviterName: 'Sam', role: 'family' };

  async function renderWith(data) {
    Object.assign(mockAuth, { user: { email: 'me@example.test', email_verified: true } });
    Object.assign(mockData, { invites: [INVITE], refreshInvites: jest.fn(), ...data });
    await act(async () => {
      tree = TestRenderer.create(<InvitesScreen navigation={navigation} />);
    });
  }

  it('welcomes the new pet only when accepting worked', async () => {
    await renderWith({ acceptInvite: jest.fn(() => Promise.resolve(true)) });
    await act(async () => button(tree, 'Accept').props.onPress());
    expect(showToast).toHaveBeenCalledWith("You're now caring for Bella");
  });

  it('says accepting failed instead of welcoming a pet that never arrived', async () => {
    await renderWith({ acceptInvite: jest.fn(() => Promise.resolve(false)) });
    await act(async () => button(tree, 'Accept').props.onPress());
    expect(showToast).toHaveBeenCalledWith("Couldn't accept the invite for Bella. Try again.");
    expect(showToast).not.toHaveBeenCalledWith("You're now caring for Bella");
  });

  it('says declining failed instead of confirming it', async () => {
    await renderWith({ declineInvite: jest.fn(() => Promise.resolve(false)) });
    await act(async () => button(tree, 'Decline').props.onPress());
    const confirm = tree.root.findAll((n) => n.props.onConfirm && n.props.visible)[0];
    await act(async () => confirm.props.onConfirm());
    expect(showToast).toHaveBeenCalledWith("Couldn't decline the invitation. Try again.");
    expect(showToast).not.toHaveBeenCalledWith('Invitation declined');
  });
});
