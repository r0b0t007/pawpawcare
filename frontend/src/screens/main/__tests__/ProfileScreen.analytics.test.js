// "Share usage analytics" switch: shows PostHog's real state, is locked while
// the account save is in flight, and rolls the device back (with a toast) when
// the save fails — otherwise the stale server value would silently undo the
// user's choice at the next launch.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../services/prefs', () => ({
  getPref: jest.fn((_, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../services/notifications', () => ({
  // Notifications allowed: the CHW-230 banner stays hidden in these tests.
  getNotificationPermission: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  requestNotificationPermission: jest.fn(),
  scheduleLocalReminders: jest.fn(),
  cancelAllLocalReminders: jest.fn(),
}));
jest.mock('../../../services/exportRecords', () => ({ exportRecords: jest.fn() }));
jest.mock('../../../services/sentry', () => ({ captureException: jest.fn(), isSentryEnabled: () => false }));
jest.mock('../../../services/analytics', () => ({
  isAnalyticsEnabled: jest.fn(() => true),
  setAnalyticsEnabled: jest.fn(),
}));
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));

const mockUpdateUser = jest.fn();
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Sam', email: 's@example.com', analytics_opt_out: false },
    isAdmin: false,
    logout: jest.fn(),
    updateUser: mockUpdateUser,
  }),
}));
jest.mock('../../../hooks/useInvites', () => ({ useInvitesQuery: () => ({ data: [] }) }));
jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ reminders: [], pets: [] }),
}));

import React from 'react';
import { Switch } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen';
import { setAnalyticsEnabled } from '../../../services/analytics';
import { showToast } from '../../../components/Toast';

function analyticsSwitch(tree) {
  return tree.root.findAll((n) => n.type === Switch && n.props.accessibilityLabel === 'Share usage analytics')[0];
}

async function render() {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<ProfileScreen navigation={{ navigate: jest.fn() }} />);
  });
  return tree;
}

beforeEach(() => jest.clearAllMocks());

test('saves the opt-out on the account and locks the switch meanwhile', async () => {
  let finishSave;
  mockUpdateUser.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
  const tree = await render();

  act(() => {
    analyticsSwitch(tree).props.onValueChange(false);
  });
  expect(setAnalyticsEnabled).toHaveBeenCalledWith(false);
  expect(mockUpdateUser).toHaveBeenCalledWith({ analytics_opt_out: true });
  expect(analyticsSwitch(tree).props.disabled).toBe(true);

  await act(async () => finishSave(true));
  expect(analyticsSwitch(tree).props.value).toBe(false);
  expect(analyticsSwitch(tree).props.disabled).toBe(false);
  expect(showToast).not.toHaveBeenCalled();
});

test('a failed save rolls the device back and tells the user', async () => {
  mockUpdateUser.mockResolvedValue(false);
  const tree = await render();

  await act(async () => {
    await analyticsSwitch(tree).props.onValueChange(false);
  });

  expect(setAnalyticsEnabled).toHaveBeenNthCalledWith(1, false);
  expect(setAnalyticsEnabled).toHaveBeenNthCalledWith(2, true); // rolled back
  expect(analyticsSwitch(tree).props.value).toBe(true);
  expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't save/));
});
