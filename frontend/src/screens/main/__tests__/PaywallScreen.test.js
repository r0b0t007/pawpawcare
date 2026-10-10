// Paywall states and flows: the free-forever promise, the Apple 3.1.2
// disclosure, purchase / cancel / restore, and the fallbacks.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../services/purchases', () => ({ isAvailable: jest.fn(() => true) }));

let mockPlan;
let mockOfferings;
const mockPurchase = { mutateAsync: jest.fn(), isPending: false };
const mockRestore = { mutateAsync: jest.fn(), isPending: false };
jest.mock('../../../hooks/useSubscription', () => ({
  usePlan: () => mockPlan,
  useOfferings: () => mockOfferings,
  usePurchase: () => mockPurchase,
  useRestore: () => mockRestore,
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import PaywallScreen from '../PaywallScreen';
import { showToast } from '../../../components/Toast';
import { track } from '../../../services/analytics';
import { isAvailable } from '../../../services/purchases';

const pkg = (packageType, priceString, price, subscriptionPeriod, extra = {}) => ({
  identifier: `$rc_${packageType.toLowerCase()}`,
  packageType,
  product: { priceString, price, subscriptionPeriod, ...extra },
  raw: {},
});
const MONTHLY = pkg('MONTHLY', '$4.99', 4.99, 'P1M');
const ANNUAL = pkg('ANNUAL', '$39.99', 39.99, 'P1Y');

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

async function render(params) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<PaywallScreen navigation={navigation} route={{ params }} />);
  });
  return tree;
}

const texts = (tree) =>
  tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).filter((c) => typeof c === 'string').join(''));
const hasText = (tree, re) => texts(tree).some((t) => re.test(t));
const button = (tree, label) => tree.root.findAll((n) => n.props.label === label && typeof n.props.onPress === 'function')[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockPlan = { plan: { active: false }, visible: true, canPurchase: true };
  mockOfferings = { data: { packages: [MONTHLY, ANNUAL] }, isLoading: false, isError: false, refetch: jest.fn() };
  mockPurchase.isPending = false;
  mockRestore.isPending = false;
  isAvailable.mockReturnValue(true);
});

test('promises free records, defaults to annual with its saving, and shows the renewal terms', async () => {
  const tree = await render({ feature: 'ai_extraction' });

  expect(hasText(tree, /records and exports stay free forever/)).toBe(true);
  expect(hasText(tree, /Reading vet documents with AI is part of Plus/)).toBe(true);
  expect(hasText(tree, /\$39\.99 \/ year/)).toBe(true);
  expect(tree.root.findAll((n) => n.props.label === 'Save 33%').length).toBeGreaterThan(0);
  expect(hasText(tree, /renews automatically/)).toBe(true);
  expect(hasText(tree, /cancel at least 24 hours/)).toBe(true);
  expect(hasText(tree, /Terms of Use/)).toBe(true);
  expect(hasText(tree, /Privacy Policy/)).toBe(true);
  expect(track).toHaveBeenCalledWith('paywall_viewed', { feature: 'ai_extraction' });
});

test('a completed purchase welcomes the user and closes', async () => {
  mockPurchase.mutateAsync.mockResolvedValueOnce({ status: 'purchased', synced: true, plan: { active: true } });
  const tree = await render();

  await act(async () => {
    await button(tree, 'Subscribe').props.onPress();
  });

  expect(mockPurchase.mutateAsync).toHaveBeenCalledWith(ANNUAL);
  expect(showToast).toHaveBeenCalledWith('Welcome to Plus!');
  expect(navigation.goBack).toHaveBeenCalled();
});

test('cancelling leaves the paywall open and says nothing', async () => {
  mockPurchase.mutateAsync.mockResolvedValueOnce({ status: 'cancelled' });
  const tree = await render();

  await act(async () => {
    await button(tree, 'Subscribe').props.onPress();
  });

  expect(showToast).not.toHaveBeenCalled();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test('a purchase the server has not confirmed yet still closes, with a heads-up', async () => {
  mockPurchase.mutateAsync.mockResolvedValueOnce({ status: 'purchased', synced: false, plan: null });
  const tree = await render();

  await act(async () => {
    await button(tree, 'Subscribe').props.onPress();
  });

  expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/may take a minute/));
  expect(navigation.goBack).toHaveBeenCalled();
});

test('a free trial changes the call to action', async () => {
  mockOfferings.data.packages = [
    pkg('ANNUAL', '$39.99', 39.99, 'P1Y', { introPrice: { price: 0, priceString: '$0.00', periodUnit: 'WEEK', periodNumberOfUnits: 1 } }),
  ];
  const tree = await render();

  expect(button(tree, 'Start free trial')).toBeDefined();
  expect(hasText(tree, /Try 1 week free, then \$39\.99 \/ year/)).toBe(true);
  expect(hasText(tree, /unused part of a free trial/)).toBe(true);
});

test('restore reports what it found', async () => {
  mockRestore.mutateAsync.mockResolvedValueOnce({ status: 'restored', plan: { active: false } });
  const tree = await render();
  const restoreLink = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && n.findAll((c) => c.type === Text && [].concat(c.props.children).join('') === 'Restore purchases').length > 0)[0];

  await act(async () => {
    await restoreLink.props.onPress();
  });

  expect(showToast).toHaveBeenCalledWith('No purchases found to restore');
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test('an old build without purchases asks for an update instead', async () => {
  isAvailable.mockReturnValue(false);
  const tree = await render();

  expect(hasText(tree, /Update the app to subscribe/)).toBe(true);
  expect(button(tree, 'Subscribe')).toBeUndefined();
  expect(hasText(tree, /renews automatically/)).toBe(false);
});

test('a load failure offers a retry', async () => {
  mockOfferings = { data: undefined, isLoading: false, isError: true, refetch: jest.fn() };
  const tree = await render();

  expect(hasText(tree, /Plans aren't available right now/)).toBe(true);
  act(() => button(tree, 'Try again').props.onPress());
  expect(mockOfferings.refetch).toHaveBeenCalled();
});

test('someone already on Plus is not sold to again', async () => {
  mockPlan = { plan: { active: true }, visible: true, canPurchase: true };
  const tree = await render();

  expect(hasText(tree, /You're on Plus/)).toBe(true);
  expect(button(tree, 'Subscribe')).toBeUndefined();
});
