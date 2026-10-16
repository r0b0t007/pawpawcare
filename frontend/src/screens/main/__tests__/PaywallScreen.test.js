// Paywall states and flows: the free-forever promise, the Apple 3.1.2
// disclosure, purchase / cancel / restore, and the fallbacks.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../services/purchases', () => ({
  purchaseErrorKind: jest.fn(() => 'other'),
}));

let mockPlan;
let mockOfferings;
let mockOfferingsWanted;
const mockPurchase = { mutateAsync: jest.fn(), isPending: false };
const mockRestore = { mutateAsync: jest.fn(), isPending: false };
jest.mock('../../../hooks/useSubscription', () => ({
  usePlan: () => mockPlan,
  useOfferings: (wanted) => {
    mockOfferingsWanted = wanted;
    return mockOfferings;
  },
  usePurchase: () => mockPurchase,
  useRestore: () => mockRestore,
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import PaywallScreen from '../PaywallScreen';
import { showToast } from '../../../components/Toast';
import { track } from '../../../services/analytics';
import { purchaseErrorKind } from '../../../services/purchases';

const pkg = (packageType, priceString, price, subscriptionPeriod, extra = {}) => ({
  identifier: `$rc_${packageType.toLowerCase()}`,
  packageType,
  product: { priceString, price, subscriptionPeriod, ...extra },
  raw: {},
});
const MONTHLY = pkg('MONTHLY', '$4.99', 4.99, 'P1M');
const ANNUAL = pkg('ANNUAL', '$39.99', 39.99, 'P1Y');

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

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
  mockPlan = { plan: { active: false }, visible: true, included: false, canPurchase: true, availability: 'ready' };
  mockOfferings = { data: { packages: [MONTHLY, ANNUAL] }, isLoading: false, isError: false, refetch: jest.fn() };
  mockPurchase.isPending = false;
  mockRestore.isPending = false;
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
  expect(hasText(tree, /free trial becomes a paid subscription unless you cancel at least 24 hours before it ends/)).toBe(true);
  expect(hasText(tree, /unused part/)).toBe(false);
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
  mockPlan = { ...mockPlan, canPurchase: false, availability: 'no_module' };
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
  mockPlan = { ...mockPlan, plan: { active: true }, included: true };
  const tree = await render();

  expect(hasText(tree, /You're on Plus/)).toBe(true);
  expect(button(tree, 'Subscribe')).toBeUndefined();
});

const restoreLinkOf = (tree) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && n.findAll((c) => c.type === Text && [].concat(c.props.children).join('') === 'Restore purchases').length > 0)[0];

describe('review fixes', () => {
  it('early members are never sold to', async () => {
    mockPlan = { ...mockPlan, plan: { active: false, grandfathered: true }, included: true };
    const tree = await render();
    expect(hasText(tree, /Plus features are included for you/)).toBe(true);
    expect(button(tree, 'Subscribe')).toBeUndefined();
    expect(hasText(tree, /Restore purchases/)).toBe(false);
  });

  it('says the right thing when nothing can be bought', async () => {
    mockPlan = { ...mockPlan, visible: false, canPurchase: false };
    expect(hasText(await render(), /Plus isn't available yet/)).toBe(true);

    mockPlan = { ...mockPlan, visible: true, canPurchase: false, availability: 'no_key' };
    const tree = await render();
    expect(hasText(tree, /aren't available on this device yet/)).toBe(true);
    expect(hasText(tree, /Update the app/)).toBe(false); // updating wouldn't help
  });

  it('points to Restore when the store account already owns Plus', async () => {
    purchaseErrorKind.mockReturnValueOnce('already_owned');
    mockPurchase.mutateAsync.mockRejectedValueOnce({ code: '7' });
    const tree = await render();

    await act(async () => {
      await button(tree, 'Subscribe').props.onPress();
    });

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Restore purchases/));
  });

  it('a restore the server has not confirmed yet is not reported as nothing found', async () => {
    mockRestore.mutateAsync.mockResolvedValueOnce({ status: 'restored', synced: false, plan: null });
    const tree = await render();

    await act(async () => {
      await restoreLinkOf(tree).props.onPress();
    });

    expect(showToast).toHaveBeenCalledWith('Restored — it may take a minute to show up');
  });

  it('locks close during a purchase and ignores a second tap', async () => {
    let finish;
    mockPurchase.mutateAsync.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    const tree = await render();

    let first;
    act(() => {
      first = button(tree, 'Subscribe').props.onPress();
      button(tree, 'Subscribe').props.onPress(); // double tap
    });
    expect(mockPurchase.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ status: 'cancelled' });
      await first;
    });

    // While a purchase is in flight, the modal can't be closed from its button.
    mockPurchase.isPending = true;
    const busy = await render();
    const closeBtn = busy.root.findAll((n) => n.props.accessibilityLabel === 'Close' && 'disabled' in n.props)[0];
    expect(closeBtn.props.disabled).toBe(true);
  });

  it('never navigates after the paywall was dismissed mid-purchase', async () => {
    let finish;
    mockPurchase.mutateAsync.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    const tree = await render();
    let pending;
    act(() => {
      pending = button(tree, 'Subscribe').props.onPress();
    });

    act(() => tree.unmount()); // swiped away
    await act(async () => {
      finish({ status: 'purchased', synced: true, plan: { active: true } });
      await pending;
    });

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Welcome to Plus!');
  });
});

describe('review round 2', () => {
  it('a paid intro price is never called a free trial', async () => {
    mockOfferings.data.packages = [
      pkg('MONTHLY', '$4.99', 4.99, 'P1M', { introPrice: { price: 0.99, priceString: '$0.99', periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 3 } }),
    ];
    const tree = await render();

    expect(button(tree, 'Subscribe')).toBeDefined();
    expect(button(tree, 'Start free trial')).toBeUndefined();
    expect(hasText(tree, /\$0\.99 \/ month for 3 months, then \$4\.99 \/ month/)).toBe(true);
    expect(hasText(tree, /introductory price applies for the period shown/)).toBe(true);
    expect(hasText(tree, /free trial/)).toBe(false);
  });

  it('a lifetime-only offering is a one-time purchase, not a subscription', async () => {
    mockOfferings.data.packages = [pkg('LIFETIME', '$99.99', 99.99, null)];
    const tree = await render();

    expect(button(tree, 'Buy')).toBeDefined();
    expect(button(tree, 'Subscribe')).toBeUndefined();
    expect(hasText(tree, /\$99\.99 · one-time/)).toBe(true);
    expect(hasText(tree, /one-time purchase — it never renews/)).toBe(true);
    expect(hasText(tree, /renews automatically/)).toBe(false);
  });

  it('swipe-down and back cannot leave mid-purchase, but the paywall can close itself', async () => {
    let finish;
    mockPurchase.mutateAsync.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    const tree = await render();
    const beforeRemove = navigation.addListener.mock.calls.find(([event]) => event === 'beforeRemove')[1];

    let pending;
    act(() => {
      pending = button(tree, 'Subscribe').props.onPress();
    });
    const swipe = { preventDefault: jest.fn() };
    beforeRemove(swipe);
    expect(swipe.preventDefault).toHaveBeenCalled();

    navigation.goBack.mockImplementationOnce(() => {
      const own = { preventDefault: jest.fn() };
      beforeRemove(own); // the paywall's own close after success
      expect(own.preventDefault).not.toHaveBeenCalled();
    });
    await act(async () => {
      finish({ status: 'purchased', synced: true, plan: { active: true } });
      await pending;
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('turns the swipe gesture off while busy', async () => {
    mockPurchase.isPending = true;
    await render();
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  });

  it('does not load prices for someone with nothing to buy', async () => {
    mockPlan = { ...mockPlan, plan: { active: true }, included: true };
    await render();
    expect(mockOfferingsWanted).toBe(false);

    mockPlan = { ...mockPlan, plan: { active: false }, included: false };
    await render();
    expect(mockOfferingsWanted).toBe(true);
  });
});

test('the renewal disclosure reads exactly as before i18n', async () => {
  const tree = await render();
  expect(texts(tree)).toContain(
    'Payment is charged to your Apple ID when you confirm. The subscription renews automatically at the same price ' +
      'unless you cancel at least 24 hours before the end of the current period. Manage or cancel anytime in your ' +
      'App Store settings.',
  );
});

test('speaks French when the app does', async () => {
  const i18n = require('../../../i18n').default;
  await act(async () => { await i18n.changeLanguage('fr'); });
  try {
    const tree = await render();
    expect(hasText(tree, /restent gratuits pour toujours/)).toBe(true);
    expect(hasText(tree, /39,99|39\.99/)).toBe(true);
    expect(button(tree, "S'abonner")).toBeTruthy();
  } finally {
    await act(async () => { await i18n.changeLanguage('en'); });
  }
});
