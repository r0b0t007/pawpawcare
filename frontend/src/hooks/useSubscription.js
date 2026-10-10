import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { post } from '../services/api';
import { track } from '../services/analytics';
import {
  getOfferings,
  isAvailable,
  purchasePackage,
  restorePurchases,
} from '../services/purchases';
import { subscriptionKeys } from './queryKeys';

// Subscription state comes from the server (GET /users/me → plan + features);
// RevenueCat is only used to show prices and run the store purchase. After
// any store purchase or restore, the server re-reads RevenueCat
// (POST /users/me/subscription/sync) and the user is refreshed — what's
// unlocked is always the server's answer.

const FREE_PLAN = {
  tier: 'free',
  active: false,
  is_lifetime: false,
  expires_at: null,
  will_renew: false,
  billing_issue: false,
  in_grace_period: false,
  store: null,
  grandfathered: false,
};

const NO_FEATURES = { paywall_enabled: false, subscriptions_visible: false, gated: {} };

/** The account's plan and the server's subscription switches. */
export function usePlan() {
  const { user } = useAuth();
  const features = user?.features ?? NO_FEATURES;
  return {
    plan: user?.plan ?? FREE_PLAN,
    features,
    visible: !!features.subscriptions_visible,
    // Old builds (no native module) and builds without a store key can't buy.
    canPurchase: !!features.subscriptions_visible && isAvailable(),
  };
}

// Store prices change rarely; an hour avoids refetching on every paywall open.
const OFFERINGS_STALE_MS = 60 * 60 * 1000;

/** The packages to offer — only fetched when the user can see subscriptions. */
export function useOfferings() {
  const { canPurchase } = usePlan();
  return useQuery({
    queryKey: subscriptionKeys.offerings,
    queryFn: getOfferings,
    enabled: canPurchase,
    staleTime: OFFERINGS_STALE_MS,
  });
}

function useStoreAction(kind, storeCall) {
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: async (arg) => {
      const result = await storeCall(arg);
      if (result.status !== 'purchased' && result.status !== 'restored') return result;

      // The webhook would get there too, but the user is waiting: ask the
      // server to verify with RevenueCat now. A failure here doesn't undo the
      // purchase — the webhook / reconcile job settle it shortly.
      let synced = true;
      try {
        await post('/users/me/subscription/sync');
      } catch (e) {
        synced = false;
      }
      const user = await refreshUser().catch(() => null);
      return { ...result, synced, plan: user?.plan ?? null };
    },
    onSuccess: (result, arg) => {
      track(kind === 'purchase' ? 'subscription_purchase' : 'purchases_restore', {
        result: result.status,
        synced: result.synced ?? null,
        ...(kind === 'purchase' && arg?.packageType ? { package_type: String(arg.packageType).toLowerCase() } : {}),
      });
    },
    onError: () => {
      track(kind === 'purchase' ? 'subscription_purchase' : 'purchases_restore', { result: 'error' });
    },
  });
}

/** mutate(package from useOfferings) → { status: purchased|cancelled|pending, synced, plan } */
export const usePurchase = () => useStoreAction('purchase', purchasePackage);

/** mutate() → { status: 'restored', synced, plan } */
export const useRestore = () => useStoreAction('restore', () => restorePurchases());
