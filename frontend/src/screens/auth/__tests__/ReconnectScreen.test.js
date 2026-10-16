import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockAuth = { retryRestore: jest.fn(), logout: jest.fn(), restoreOffline: true };
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import ReconnectScreen from '../ReconnectScreen';

const text = (node) => node.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children[0]);
const pressable = (tree, label) =>
  tree.root.find((n) => n.props.accessibilityRole === 'button' && text(n).includes(label));

describe('ReconnectScreen', () => {
  let tree;
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      tree = TestRenderer.create(<ReconnectScreen />);
    });
  });
  afterEach(() => act(() => tree.unmount()));

  it('says the session is intact rather than signed out', () => {
    const shown = text(tree.root).join(' ');
    expect(shown).toContain("Can't reach PawPawCare");
    expect(shown).toContain("You're still signed in");
    expect(shown).toContain('Check your connection');
  });

  it("doesn't blame the connection when the server answered with an error", () => {
    mockAuth.restoreOffline = false;
    act(() => tree.update(<ReconnectScreen />));
    const shown = text(tree.root).join(' ');
    mockAuth.restoreOffline = true;

    expect(shown).not.toContain('Check your connection');
    expect(shown).toContain("isn't answering");
  });

  it('retries the restore from "Try again"', () => {
    act(() => pressable(tree, 'Try again').props.onPress());
    expect(mockAuth.retryRestore).toHaveBeenCalledTimes(1);
  });

  it('can still sign out', () => {
    act(() => pressable(tree, 'Sign out').props.onPress());
    expect(mockAuth.logout).toHaveBeenCalledTimes(1);
  });
});

test('speaks French when the app does', async () => {
  const i18n = require('../../../i18n').default;
  await act(async () => { await i18n.changeLanguage('fr'); });
  let tree;
  try {
    act(() => {
      tree = TestRenderer.create(<ReconnectScreen />);
    });
    expect(text(tree.root)).toContain('Impossible de joindre PawPawCare');
  } finally {
    act(() => tree?.unmount());
    await act(async () => { await i18n.changeLanguage('en'); });
  }
});
