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
const mockInvitesQuery = {};
jest.mock('../../../hooks/useInvites', () => ({ useInvitesQuery: () => mockInvitesQuery }));
const showInvites = (data, extra = {}) =>
  Object.assign(mockInvitesQuery, { data, isLoading: false, isError: false, refetch: jest.fn(), ...extra });

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
    showInvites([INVITE]);
    Object.assign(mockData, data);
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

  // A failed load must not read as "no invitations".
  it('says the invitations failed to load, with a retry', async () => {
    Object.assign(mockAuth, { user: { email: 'me@example.test', email_verified: true } });
    const refetch = jest.fn();
    showInvites(undefined, { isError: true, refetch });
    await act(async () => {
      tree = TestRenderer.create(<InvitesScreen navigation={navigation} />);
    });
    const texts = tree.root.findAllByType(require('react-native').Text).map((n) => [].concat(n.props.children).join(''));
    expect(texts).toContain("Couldn't load your invitations.");
    expect(texts).not.toContain('No pending invitations');
    await act(async () => button(tree, 'Try again').props.onPress());
    expect(refetch).toHaveBeenCalled();
  });

  it('shows nothing, not the empty state, while the first load runs', async () => {
    Object.assign(mockAuth, { user: { email: 'me@example.test', email_verified: true } });
    showInvites(undefined, { isLoading: true });
    await act(async () => {
      tree = TestRenderer.create(<InvitesScreen navigation={navigation} />);
    });
    expect(tree.root.findAll((n) => n.props.title === 'No pending invitations')).toHaveLength(0);
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

describe('in French', () => {
  const i18n = require('../../../i18n').default;
  const { Text } = require('react-native');
  const flat = (node) => [].concat(node.props.children).map((c) => (typeof c === 'string' ? c : flat(c))).join('');
  beforeEach(async () => {
    await act(async () => { await i18n.changeLanguage('fr'); });
  });
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('Account details is titled in French', async () => {
    Object.assign(mockAuth, { user: { name: 'Sam', email: 'sam@example.test' }, updateUser: jest.fn(), deleteAccount: jest.fn() });
    await act(async () => {
      tree = TestRenderer.create(<AccountDetailsScreen navigation={navigation} />);
    });
    expect(button(tree, 'Enregistrer les modifications')).toBeTruthy();
  });

  it('an invitation reads in French, with the names as written', async () => {
    Object.assign(mockAuth, { user: { email: 'me@example.test', email_verified: true } });
    showInvites([{ id: 'i1', petName: 'Bella <3', inviterName: 'Sam', role: 'family' }]);
    Object.assign(mockData, { acceptInvite: jest.fn(() => Promise.resolve(true)) });
    await act(async () => {
      tree = TestRenderer.create(<InvitesScreen navigation={navigation} />);
    });
    const lines = tree.root.findAllByType(Text).map(flat);
    expect(lines).toContain('Sam vous invite à devenir copropriétaire de Bella <3');
    await act(async () => button(tree, 'Accepter').props.onPress());
    expect(showToast).toHaveBeenCalledWith('Vous prenez désormais soin de Bella <3');
  });
});

test('an invitation reads exactly as before i18n, names in bold', async () => {
  const { Text } = require('react-native');
  Object.assign(mockAuth, { user: { email: 'me@example.test', email_verified: true } });
  showInvites([{ id: 'i1', petName: 'Bella', inviterName: 'Sam' }]);
  await act(async () => {
    tree = TestRenderer.create(<InvitesScreen navigation={navigation} />);
  });
  const line = tree.root.findAll(
    (n) => n.type === Text && [].concat(n.props.children).some((c) => c?.props?.children === 'Bella'),
  )[0];
  const parts = [].concat(line.props.children);
  expect(parts.map((c) => (typeof c === 'string' ? c : c.props.children)).join('')).toBe('Sam invited you to co-own Bella');
  expect(parts.filter((c) => typeof c !== 'string').map((c) => c.props.children)).toEqual(['Sam', 'Bella']);
});
