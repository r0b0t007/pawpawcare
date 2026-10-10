import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfferings, usePlan, usePurchase, useRestore } from '../../hooks/useSubscription';
import { track } from '../../services/analytics';
import { purchaseErrorKind } from '../../services/purchases';
import {
  annualSavings,
  introOfferText,
  isFreeTrial,
  isRenewing,
  priceWithPeriod,
  restoreOutcome,
} from '../../utils/subscription';
import { ui, type, radii, motion } from '../../theme';
import { Card, ListRow, SegmentedControl, StatusPill, Button, Skeleton, showToast } from '../../components';

// PawPawCare Plus paywall — a modal on the root stack:
// navigation.navigate('Paywall', { feature }). Prices come from the store via
// RevenueCat; what a purchase unlocks is the server's answer (useSubscription).
// Only reachable while the server makes subscriptions visible to the account.

const TERMS_URL = 'https://pawpawcare.app/terms/';
const PRIVACY_URL = 'https://pawpawcare.app/privacy/';

// Why a gated feature sent the user here (keys match the server's gates).
const FEATURE_REASONS = {
  ai_extraction: 'Reading vet documents with AI is part of Plus.',
  care_links: 'Caretaker links are part of Plus.',
};

const BENEFITS = [
  { icon: 'file-document-outline', title: 'Read vet documents with AI', subtitle: 'Snap a record — vaccines, meds and weights fill in for you' },
  { icon: 'link-variant', title: 'Caretaker links', subtitle: 'Share a care guide with sitters, no app needed' },
  { icon: 'heart-outline', title: 'Keep PawPawCare independent', subtitle: 'No ads, no selling data — ever' },
];

const STORE = Platform.select({ ios: 'Apple ID', android: 'Google Play account', default: 'store account' });
const STORE_SETTINGS = Platform.select({ ios: 'App Store', android: 'Google Play', default: 'store' });

const PURCHASE_ERRORS = {
  already_owned: `Your ${STORE} already has Plus — tap Restore purchases to use it here`,
  network: 'No connection — check it and try again',
  unavailable: "Purchases aren't available right now — try again later",
  other: "Couldn't complete the purchase — try again",
};

/** Apple 3.1.2 disclosure for what's being bought. */
function legalText(renewing, freeTrial, hasIntro) {
  if (!renewing) {
    return `Payment is charged to your ${STORE} when you confirm. This is a one-time purchase — it never renews.`;
  }
  const trial = freeTrial
    ? ' Your free trial becomes a paid subscription unless you cancel at least 24 hours before it ends.'
    : hasIntro
      ? ' The introductory price applies for the period shown, then the regular price.'
      : '';
  return (
    `Payment is charged to your ${STORE} when you confirm.${trial} The subscription renews automatically at ` +
    'the same price unless you cancel at least 24 hours before the end of the current period. Manage or ' +
    `cancel anytime in your ${STORE_SETTINGS} settings.`
  );
}

/** A full-width explanation card (states where nothing can be bought). */
function StateCard({ title, message, action }) {
  return (
    <Card style={styles.stateCard}>
      <Text style={[type.cardTitleSm, styles.ink]}>{title}</Text>
      <Text selectable style={[type.body, styles.sub]}>{message}</Text>
      {action}
    </Card>
  );
}

export default function PaywallScreen({ navigation, route }) {
  const feature = route?.params?.feature;
  const { plan, visible, included, canPurchase, availability } = usePlan();
  const offerings = useOfferings(!included); // nothing to sell to Plus / early members
  const purchase = usePurchase();
  const restore = useRestore();

  // The modal can be dismissed (swipe / back) while a purchase finishes;
  // never navigate from a screen that's gone.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  // A second tap before isPending re-renders must not start a second purchase.
  const inFlight = useRef(false);
  // Set when the paywall closes itself, so the guard below lets that through.
  const closing = useRef(false);

  useEffect(() => {
    track('paywall_viewed', feature ? { feature } : {});
  }, [feature]);

  const packages = offerings.data?.packages ?? [];
  const monthly = packages.find((p) => p.packageType === 'MONTHLY');
  const annual = packages.find((p) => p.packageType === 'ANNUAL');
  const choices = [monthly, annual].filter(Boolean);
  const [choice, setChoice] = useState(null);
  const selected = choices.find((p) => p.packageType === choice) ?? annual ?? monthly ?? packages[0] ?? null;
  const savings = annualSavings(monthly, annual);
  const intro = introOfferText(selected?.product);
  const freeTrial = isFreeTrial(selected?.product);
  // Lifetime / one-time packages are bought, not subscribed to.
  const renewing = isRenewing(selected?.product);
  const busy = purchase.isPending || restore.isPending;

  // Mid-purchase, swipe-down (iOS) and hardware back (Android) follow the
  // same rule as the locked X: the user can't leave halfway through.
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !busy });
  }, [navigation, busy]);
  useEffect(
    () =>
      navigation.addListener?.('beforeRemove', (e) => {
        if (inFlight.current && !closing.current) e.preventDefault();
      }),
    [navigation],
  );

  const close = () => {
    if (mounted.current && navigation.canGoBack()) {
      closing.current = true;
      navigation.goBack();
    }
  };

  const runOnce = async (task) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await task();
    } finally {
      inFlight.current = false;
    }
  };

  const handlePurchase = () =>
    runOnce(async () => {
      if (!selected) return;
      try {
        const result = await purchase.mutateAsync(selected);
        if (result.status === 'cancelled') return;
        if (result.status === 'pending') {
          showToast('Purchase pending — it will unlock once approved');
        } else if (result.plan?.active) {
          showToast('Welcome to Plus!');
        } else {
          showToast('Purchase complete — it may take a minute to show up');
        }
        close();
      } catch (err) {
        showToast(PURCHASE_ERRORS[purchaseErrorKind(err)]);
      }
    });

  const handleRestore = () =>
    runOnce(async () => {
      try {
        const { message, done } = restoreOutcome(await restore.mutateAsync());
        showToast(message);
        if (done) close();
      } catch (_) {
        showToast("Couldn't restore purchases — try again");
      }
    });

  let body;
  if (plan.active) {
    body = (
      <StateCard
        title="You're on Plus"
        message="Thanks for supporting PawPawCare. Manage it from Profile → Subscription."
        action={<Button label="Done" onPress={close} />}
      />
    );
  } else if (included) {
    body = (
      <StateCard
        title="Plus features are included for you"
        message="As an early member you already have them — nothing to buy."
        action={<Button label="Done" onPress={close} />}
      />
    );
  } else if (!visible) {
    body = (
      <StateCard
        title="Plus isn't available yet"
        message="Everything you use today stays free."
        action={<Button label="Close" variant="ghost" onPress={close} />}
      />
    );
  } else if (availability === 'no_module') {
    body = (
      <StateCard
        title="Update the app to subscribe"
        message="Subscriptions need the latest version of PawPawCare. Everything you use today stays free."
        action={<Button label="Close" variant="ghost" onPress={close} />}
      />
    );
  } else if (!canPurchase) {
    body = (
      <StateCard
        title="Subscriptions aren't available on this device yet"
        message="Everything you use today stays free."
        action={<Button label="Close" variant="ghost" onPress={close} />}
      />
    );
  } else if (offerings.isLoading) {
    body = (
      <View style={styles.loading}>
        <Skeleton height={44} radius={radii.control} />
        <Skeleton height={52} radius={radii.control} />
      </View>
    );
  } else if (offerings.isError || !selected) {
    body = (
      <StateCard
        title="Plans aren't available right now"
        message="Check your connection and try again in a moment."
        action={<Button label="Try again" variant="ghost" onPress={() => offerings.refetch()} />}
      />
    );
  } else {
    body = (
      <View style={styles.purchase}>
        {choices.length > 1 && (
          <SegmentedControl
            segments={choices.map((p) => ({ value: p.packageType, label: p.packageType === 'ANNUAL' ? 'Annual' : 'Monthly' }))}
            value={selected.packageType}
            onChange={(value) => {
              if (!busy) setChoice(value); // never switch what's being charged
            }}
          />
        )}
        <View style={styles.priceRow}>
          <Text style={[type.cardTitle, styles.ink]}>
            {renewing ? priceWithPeriod(selected.product) : `${selected.product.priceString} · one-time`}
          </Text>
          {selected.packageType === 'ANNUAL' && savings ? <StatusPill status="ok" label={`Save ${savings}%`} /> : null}
        </View>
        {renewing && intro ? (
          <Text style={[type.secondary, styles.sub]}>{intro}, then {priceWithPeriod(selected.product)}</Text>
        ) : null}
        <Button
          label={purchase.isPending ? 'Processing…' : !renewing ? 'Buy' : freeTrial ? 'Start free trial' : 'Subscribe'}
          onPress={handlePurchase}
          disabled={busy}
        />
      </View>
    );
  }

  const showPurchaseExtras = !included && canPurchase;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[type.screenTitle, styles.ink, { flex: 1 }]}>PawPawCare Plus</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: motion.pressOpacity }, busy && styles.dim]}
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityState={{ disabled: busy }}
          >
            <MaterialCommunityIcons name="close" size={19} color={ui.ink} />
          </Pressable>
        </View>

        {feature && FEATURE_REASONS[feature] ? (
          <Text style={[type.body, styles.sub, styles.reason]}>{FEATURE_REASONS[feature]}</Text>
        ) : null}

        <Card style={styles.promise}>
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={ui.success} />
          <Text style={[type.rowTitle, styles.ink, { flex: 1 }]}>
            Your pets, records and exports stay free forever.
          </Text>
        </Card>

        <Card>
          {BENEFITS.map((b, i) => (
            <ListRow key={b.title} icon={b.icon} title={b.title} subtitle={b.subtitle} last={i === BENEFITS.length - 1} />
          ))}
        </Card>

        {body}

        {showPurchaseExtras && (
          <>
            <Pressable
              onPress={handleRestore}
              disabled={busy}
              style={({ pressed }) => [styles.restore, pressed && { opacity: motion.pressOpacity }]}
              accessibilityRole="button"
            >
              <Text style={[type.rowTitle, styles.link]}>{restore.isPending ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>

            <Text style={[type.secondary, styles.legal]}>{legalText(renewing, freeTrial, !!intro)}</Text>
            <View style={styles.legalLinks}>
              <Text style={[type.secondary, styles.link]} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
                Terms of Use
              </Text>
              <Text style={[type.secondary, styles.legal]}>·</Text>
              <Text style={[type.secondary, styles.link]} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
                Privacy Policy
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingBottom: 32, paddingHorizontal: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6 },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: motion.pressOpacity },
  ink: { color: ui.ink },
  sub: { color: ui.sub },
  reason: { marginTop: -6 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  stateCard: { padding: 18, gap: 12 },
  loading: { gap: 12 },
  purchase: { gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  restore: { alignSelf: 'center', paddingVertical: 6 },
  link: { color: ui.accent },
  legal: { color: ui.subtle, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
