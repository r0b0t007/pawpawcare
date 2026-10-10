// Profile's Subscription row (dark until the server shows it), the
// Subscription screen's single status + store actions, and the
// delete-account billing warning.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
jest.mock('../../../services/prefs', () => ({
  getPref: jest.fn((_, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../services/notifications', () => ({ scheduleLocalReminders: jest.fn(), cancelAllLocalReminders: jest.fn() }));
jest.mock('../../../services/exportRecords', () => ({ exportRecords: jest.fn() }));
jest.mock('../../../services/sentry', () => ({ captureException: jest.fn(), isSentryEnabled: () => false }));
jest.mock('../../../services/analytics', () => ({ isAnalyticsEnabled: jest.fn(() => true), setAnalyticsEnabled: jest.fn(), track: jest.fn() }));
jest.mock('../../../services/purchases', () => ({
  isAvailable: jest.fn(() => true),
  getManagementUrl: jest.fn(() => Promise.resolve('https://apps.apple.com/account/subscriptions')),
}));

let mockPlanState;
const mockRestore = { mutateAsync: jest.fn(), isPending: false };
jest.mock('../../../hooks/useSubscription', () => ({
  usePlan: () => mockPlanState,
  useRestore: () => mockRestore,
}));
let mockUser;
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAdmin: false, logout: jest.fn(), updateUser: jest.fn(), deleteAccount: jest.fn() }),
}));
jest.mock('../../../context/DataContext', () => ({ useData: () => ({ invites: [], reminders: [], pets: [] }) }));

import React from 'react';
import { Linking, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen';
import SubscriptionScreen from '../SubscriptionScreen';
import AccountDetailsScreen from '../AccountDetailsScreen';
import { StatusPill, ConfirmDialog } from '../../../components';

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const allText = (tree) =>
  tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).filter((c) => typeof c === 'string').join(''));
const rowTitled = (tree, title) => tree.root.findAll((n) => n.props.title === title && 'chevron' in n.props)[0];

async function render(Screen) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<Screen navigation={navigation} />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', name: 'Sam', email: 's@example.com' };
  mockPlanState = { plan: { active: false }, visible: false, canPurchase: false };
});

describe('Profile → Subscription row', () => {
  it('is hidden while subscriptions are dark', async () => {
    const tree = await render(ProfileScreen);
    expect(allText(tree)).not.toContain('Subscription');
  });

  it('appears once visible, and opens the Subscription screen', async () => {
    mockPlanState = { plan: { active: false }, visible: true, canPurchase: true };
    const tree = await render(ProfileScreen);
    act(() => rowTitled(tree, 'Free plan').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('Subscription');
  });

  it('shows for an existing subscriber even if visibility was switched off', async () => {
    mockPlanState = { plan: { active: true, will_renew: true, expires_at: '2026-12-01T00:00:00Z' }, visible: false, canPurchase: false };
    const tree = await render(ProfileScreen);
    expect(rowTitled(tree, 'PawPawCare Plus').props.subtitle).toMatch(/^Renews /);
  });
});

describe('Subscription screen', () => {
  it('shows a payment problem once, with a way to fix it in the store', async () => {
    mockPlanState = {
      plan: { active: true, billing_issue: true, will_renew: true, store: 'app_store', expires_at: '2026-12-01T00:00:00Z' },
      visible: true,
      canPurchase: true,
    };
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = await render(SubscriptionScreen);

    const pills = tree.root.findAllByType(StatusPill);
    expect(pills).toHaveLength(1);
    expect(pills[0].props).toMatchObject({ status: 'overdue', label: 'Payment issue' });

    await act(async () => {
      await rowTitled(tree, 'Update payment method').props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    expect(allText(tree).some((t) => /doesn't cancel billing/.test(t))).toBe(true);
  });

  it('a free account can go to the paywall; lifetime has nothing to manage', async () => {
    mockPlanState = { plan: { active: false }, visible: true, canPurchase: true };
    let tree = await render(SubscriptionScreen);
    act(() => tree.root.findAll((n) => n.props.label === 'See PawPawCare Plus' && n.props.onPress)[0].props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('Paywall');

    mockPlanState = { plan: { active: true, is_lifetime: true, store: 'play_store' }, visible: true, canPurchase: true };
    tree = await render(SubscriptionScreen);
    expect(rowTitled(tree, 'Manage subscription')).toBeUndefined();
  });
});

describe('Delete account', () => {
  it('warns that store billing continues for a renewing subscription', async () => {
    mockUser = { ...mockUser, plan: { active: true, will_renew: true, is_lifetime: false, store: 'play_store' } };
    const tree = await render(AccountDetailsScreen);
    expect(tree.root.findByType(ConfirmDialog).props.message).toMatch(/keeps billing through Google Play/);
  });

  it('says nothing about billing otherwise', async () => {
    mockUser = { ...mockUser, plan: { active: true, will_renew: false, is_lifetime: true } };
    const tree = await render(AccountDetailsScreen);
    expect(tree.root.findByType(ConfirmDialog).props.message).not.toMatch(/billing/);
  });
});
