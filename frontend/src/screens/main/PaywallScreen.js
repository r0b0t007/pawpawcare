import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfferings, usePlan, usePurchase, useRestore } from '../../hooks/useSubscription';
import { track } from '../../services/analytics';
import { isAvailable } from '../../services/purchases';
import { annualSavings, introOfferText, priceWithPeriod } from '../../utils/subscription';
import { ui, type, motion } from '../../theme';
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

export default function PaywallScreen({ navigation, route }) {
  const feature = route?.params?.feature;
  const { plan, visible } = usePlan();
  const offerings = useOfferings();
  const purchase = usePurchase();
  const restore = useRestore();

  useEffect(() => {
    track('paywall_viewed', feature ? { feature } : {});
  }, [feature]);

  const packages = offerings.data?.packages ?? [];
  const monthly = packages.find((p) => p.packageType === 'MONTHLY');
  const annual = packages.find((p) => p.packageType === 'ANNUAL');
  const choices = [monthly, annual].filter(Boolean);
  const [choice, setChoice] = useState(null);
  const selected = useMemo(
    () => choices.find((p) => p.packageType === choice) ?? annual ?? monthly ?? packages[0] ?? null,
    [choice, annual, monthly, packages],
  );
  const savings = annualSavings(monthly, annual);
  const intro = introOfferText(selected?.product);
  const busy = purchase.isPending || restore.isPending;

  const close = () => navigation.goBack();

  const handlePurchase = async () => {
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
    } catch (_) {
      showToast("Couldn't complete the purchase — try again");
    }
  };

  const handleRestore = async () => {
    try {
      const result = await restore.mutateAsync();
      if (result.plan?.active) {
        showToast('Purchases restored');
        close();
      } else {
        showToast('No purchases found to restore');
      }
    } catch (_) {
      showToast("Couldn't restore purchases — try again");
    }
  };

  let body;
  if (plan.active) {
    body = (
      <Card style={styles.stateCard}>
        <Text style={[type.cardTitleSm, styles.ink]}>You're on Plus</Text>
        <Text style={[type.body, styles.sub]}>Thanks for supporting PawPawCare. Manage it from Profile → Subscription.</Text>
        <Button label="Done" onPress={close} />
      </Card>
    );
  } else if (!visible || !isAvailable()) {
    // Old build (no purchases module) or not offered yet.
    body = (
      <Card style={styles.stateCard}>
        <Text style={[type.cardTitleSm, styles.ink]}>Update the app to subscribe</Text>
        <Text style={[type.body, styles.sub]}>
          Subscriptions need the latest version of PawPawCare. Everything you use today stays free.
        </Text>
        <Button label="Close" variant="ghost" onPress={close} />
      </Card>
    );
  } else if (offerings.isLoading) {
    body = (
      <View style={styles.loading}>
        <Skeleton height={44} radius={14} />
        <Skeleton height={52} radius={14} />
      </View>
    );
  } else if (offerings.isError || !selected) {
    body = (
      <Card style={styles.stateCard}>
        <Text style={[type.cardTitleSm, styles.ink]}>Plans aren't available right now</Text>
        <Text selectable style={[type.body, styles.sub]}>Check your connection and try again in a moment.</Text>
        <Button label="Try again" variant="ghost" onPress={() => offerings.refetch()} />
      </Card>
    );
  } else {
    body = (
      <View style={styles.purchase}>
        {choices.length > 1 && (
          <SegmentedControl
            segments={choices.map((p) => ({ value: p.packageType, label: p.packageType === 'ANNUAL' ? 'Annual' : 'Monthly' }))}
            value={selected.packageType}
            onChange={setChoice}
          />
        )}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{priceWithPeriod(selected.product)}</Text>
          {selected.packageType === 'ANNUAL' && savings ? <StatusPill status="ok" label={`Save ${savings}%`} /> : null}
        </View>
        {intro ? <Text style={[type.secondary, styles.sub]}>{intro}, then {priceWithPeriod(selected.product)}</Text> : null}
        <Button
          label={purchase.isPending ? 'Processing…' : intro ? 'Start free trial' : 'Subscribe'}
          onPress={handlePurchase}
          disabled={busy}
        />
      </View>
    );
  }

  const showPurchaseExtras = !plan.active && visible && isAvailable();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[type.screenTitle, styles.ink, { flex: 1 }]}>PawPawCare Plus</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: motion.pressOpacity }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
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

        <Card style={styles.benefits}>
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
              <Text style={styles.link}>{restore.isPending ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>

            <Text style={styles.legal}>
              Payment is charged to your {STORE} when you confirm. The subscription renews automatically at
              the same price unless you cancel at least 24 hours before the end of the current period. Manage
              or cancel anytime in your {STORE_SETTINGS} settings.{intro ? ' Any unused part of a free trial ends when you subscribe.' : ''}
            </Text>
            <View style={styles.legalLinks}>
              <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
                Terms of Use
              </Text>
              <Text style={styles.legalDot}>·</Text>
              <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
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
    borderRadius: 21,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: { color: ui.ink },
  sub: { color: ui.sub },
  reason: { marginTop: -6 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  benefits: {},
  stateCard: { padding: 18, gap: 12 },
  loading: { gap: 12 },
  purchase: { gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, letterSpacing: -0.3, color: ui.ink },
  restore: { alignSelf: 'center', paddingVertical: 6 },
  link: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.accent },
  legal: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, lineHeight: 16, color: ui.subtle, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  legalLink: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11.5, color: ui.accent },
  legalDot: { fontSize: 11.5, color: ui.faint },
});
