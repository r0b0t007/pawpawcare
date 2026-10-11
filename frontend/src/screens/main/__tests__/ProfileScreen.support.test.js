// Support section: "Send feedback" opens the private form with the Feedback
// category preselected; "Help & support" opens it with none.
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
jest.mock('../../../context/DataContext', () => ({
  useData: () => ({ invites: [], reminders: [], pets: [] }),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen';
import ListRow from '../../../components/ListRow';

test('the Support rows open the form, "Send feedback" with Feedback preselected', async () => {
  const navigation = { navigate: jest.fn() };
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<ProfileScreen navigation={navigation} />);
  });
  const row = (title) => tree.root.findAll((n) => n.type === ListRow && n.props.title === title)[0];

  act(() => row('Send feedback').props.onPress());
  expect(navigation.navigate).toHaveBeenLastCalledWith('Support', { category: 'feedback' });

  act(() => row('Help & support').props.onPress());
  expect(navigation.navigate).toHaveBeenLastCalledWith('Support');
});
