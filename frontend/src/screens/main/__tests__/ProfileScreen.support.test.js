// Support section: one "Help & feedback" row opens the private form. It
// replaced two rows ("Send feedback", "Help & support") that led to the same
// screen.
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
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Sam', email: 's@example.com', analytics_opt_out: false },
    isAdmin: false,
    logout: jest.fn(),
    updateUser: jest.fn(),
  }),
}));
jest.mock('../../../hooks/useInvites', () => ({ useInvitesQuery: () => ({ data: [] }) }));
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ reminders: [], pets: [] }),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen';
import ListRow from '../../../components/ListRow';

test('one "Help & feedback" row opens the form', async () => {
  const navigation = { navigate: jest.fn() };
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<ProfileScreen navigation={navigation} />);
  });
  const row = (title) => tree.root.findAll((n) => n.type === ListRow && n.props.title === title)[0];

  expect(row('Send feedback')).toBeUndefined();
  expect(row('Help & support')).toBeUndefined();

  act(() => row('Help & feedback').props.onPress());
  expect(navigation.navigate).toHaveBeenLastCalledWith('Support');
});
