import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The purchase flow: store call → server verifies with RevenueCat → user
// refreshed. The server's answer is what counts; cancelling isn't an error.
const mockRefreshUser = jest.fn();
let mockUser = null;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }),
}));
jest.mock('../../services/api', () => ({ post: jest.fn() }));
jest.mock('../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../services/purchases', () => ({
  isAvailable: jest.fn(() => true),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
}));

import { post } from '../../services/api';
import { track } from '../../services/analytics';
import { getOfferings, isAvailable, purchasePackage, restorePurchases } from '../../services/purchases';
import { useOfferings, usePlan, usePurchase, useRestore } from '../useSubscription';

let hook;
let mounted = [];
function render(useHook) {
  // gcTime Infinity: React Query schedules no garbage-collection timers, so
  // nothing outlives the test (CI fails when Jest can't exit).
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  function Probe() {
    hook = useHook();
    return null;
  }
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  mounted.push({ renderer, client });
}

afterEach(async () => {
  // Let React Query's batched notifications land inside act, then tear down.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    mounted.forEach(({ renderer }) => renderer.unmount());
  });
  mounted.forEach(({ client }) => client.clear());
  mounted = [];
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', plan: { tier: 'free', active: false }, features: { subscriptions_visible: true, paywall_enabled: false, gated: {} } };
  mockRefreshUser.mockResolvedValue({ id: 'u1', plan: { tier: 'plus', active: true } });
});

describe('usePlan', () => {
  it('defaults to free with everything off', () => {
    mockUser = { id: 'u1' };
    render(usePlan);
    expect(hook.plan.tier).toBe('free');
    expect(hook.visible).toBe(false);
    expect(hook.canPurchase).toBe(false);
  });

  it('can purchase only when visible and the build supports it', () => {
    render(usePlan);
    expect(hook.canPurchase).toBe(true);
    isAvailable.mockReturnValueOnce(false);
    render(usePlan);
    expect(hook.canPurchase).toBe(false);
  });
});

describe('useOfferings', () => {
  it('does not ask RevenueCat while subscriptions are hidden', () => {
    mockUser.features.subscriptions_visible = false;
    render(useOfferings);
    expect(getOfferings).not.toHaveBeenCalled();
  });
});

describe('usePurchase', () => {
  it('buys, has the server verify it, then refreshes the account', async () => {
    purchasePackage.mockResolvedValueOnce({ status: 'purchased' });
    post.mockResolvedValueOnce({ plan: { tier: 'plus' } });
    render(usePurchase);

    let result;
    await act(async () => {
      result = await hook.mutateAsync({ packageType: 'ANNUAL', raw: {} });
    });

    expect(post).toHaveBeenCalledWith('/users/me/subscription/sync');
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(result).toEqual({ status: 'purchased', synced: true, plan: { tier: 'plus', active: true } });
    expect(track).toHaveBeenCalledWith('subscription_purchase', { result: 'purchased', synced: true, package_type: 'annual' });
  });

  it('a cancelled purchase touches nothing else', async () => {
    purchasePackage.mockResolvedValueOnce({ status: 'cancelled' });
    render(usePurchase);

    let result;
    await act(async () => {
      result = await hook.mutateAsync({ raw: {} });
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(post).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it('a failed server check does not undo the purchase', async () => {
    purchasePackage.mockResolvedValueOnce({ status: 'purchased' });
    post.mockRejectedValueOnce(new Error('503'));
    render(usePurchase);

    let result;
    await act(async () => {
      result = await hook.mutateAsync({ raw: {} });
    });

    expect(result.status).toBe('purchased');
    expect(result.synced).toBe(false);
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('a store error surfaces and is tracked', async () => {
    purchasePackage.mockRejectedValueOnce(new Error('store problem'));
    render(usePurchase);

    await act(async () => {
      await expect(hook.mutateAsync({ raw: {} })).rejects.toThrow('store problem');
    });

    expect(track).toHaveBeenCalledWith('subscription_purchase', { result: 'error' });
  });
});

describe('useRestore', () => {
  it('restores then syncs', async () => {
    restorePurchases.mockResolvedValueOnce({ status: 'restored' });
    post.mockResolvedValueOnce({});
    render(useRestore);

    await act(async () => {
      await hook.mutateAsync();
    });

    expect(post).toHaveBeenCalledWith('/users/me/subscription/sync');
    expect(track).toHaveBeenCalledWith('purchases_restore', { result: 'restored', synced: true });
  });
});
