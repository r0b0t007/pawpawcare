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
import { useTranslation } from '../../i18n';
import { ui, type, radii, motion } from '../../theme';
import { Card, ListRow, SegmentedControl, StatusPill, Button, Skeleton, showToast } from '../../components';

// PawPawCare Plus paywall — a modal on the root stack:
// navigation.navigate('Paywall', { feature }). Prices come from the store via
// RevenueCat; what a purchase unlocks is the server's answer (useSubscription).
// Only reachable while the server makes subscriptions visible to the account.

const TERMS_URL = 'https://pawpawcare.app/terms/';
const PRIVACY_URL = 'https://pawpawcare.app/privacy/';

// Why a gated feature sent the user here (keys match the server's gates):
// `paywall.reason.<feature>`.
const FEATURE_REASONS = new Set(['ai_extraction', 'care_links']);

const BENEFITS = [
  { id: 'ai', icon: 'file-document-outline' },
  { id: 'links', icon: 'link-variant' },
  { id: 'independent', icon: 'heart-outline' },
];

// `paywall.storeAccount.*` / `paywall.storeSettings.*`: "Apple ID", "App Store".
const STORE_KEY = Platform.select({ ios: 'ios', android: 'android', default: 'default' });

// purchaseErrorKind → `paywall.errors.*`.
const PURCHASE_ERRORS = new Set(['already_owned', 'network', 'unavailable', 'other']);

/** Apple 3.1.2 disclosure for what's being bought. */
function legalText(t, renewing, freeTrial, hasIntro) {
  const store = t(`paywall.storeAccount.${STORE_KEY}`);
  if (!renewing) return t('paywall.legal.oneTime', { store });
  const trial = freeTrial ? t('paywall.legal.trial') : hasIntro ? t('paywall.legal.intro') : null;
  return [
    t('paywall.legal.charged', { store }),
    trial,
    t('paywall.legal.renews', { settings: t(`paywall.storeSettings.${STORE_KEY}`) }),
  ]
    .filter(Boolean)
    .join(' ');
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
  const { t } = useTranslation();
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
          showToast(t('paywall.toast.pending'));
        } else if (result.plan?.active) {
          showToast(t('paywall.toast.welcome'));
        } else {
          showToast(t('paywall.toast.complete'));
        }
        close();
      } catch (err) {
        const kind = purchaseErrorKind(err);
        showToast(t(`paywall.errors.${PURCHASE_ERRORS.has(kind) ? kind : 'other'}`, { store: t(`paywall.storeAccount.${STORE_KEY}`) }));
      }
    });

  const handleRestore = () =>
    runOnce(async () => {
      try {
        const { message, done } = restoreOutcome(await restore.mutateAsync());
        showToast(message);
        if (done) close();
      } catch (_) {
        showToast(t('paywall.restoreFailed'));
      }
    });

  let body;
  if (plan.active) {
    body = (
      <StateCard
        title={t('paywall.states.plusTitle')}
        message={t('paywall.states.plusMessage')}
        action={<Button label={t('paywall.done')} onPress={close} />}
      />
    );
  } else if (included) {
    body = (
      <StateCard
        title={t('paywall.states.includedTitle')}
        message={t('paywall.states.includedMessage')}
        action={<Button label={t('paywall.done')} onPress={close} />}
      />
    );
  } else if (!visible) {
    body = (
      <StateCard
        title={t('paywall.states.hiddenTitle')}
        message={t('paywall.states.staysFree')}
        action={<Button label={t('paywall.close')} variant="ghost" onPress={close} />}
      />
    );
  } else if (availability === 'no_module') {
    body = (
      <StateCard
        title={t('paywall.states.updateTitle')}
        message={t('paywall.states.updateMessage')}
        action={<Button label={t('paywall.close')} variant="ghost" onPress={close} />}
      />
    );
  } else if (!canPurchase) {
    body = (
      <StateCard
        title={t('paywall.states.deviceTitle')}
        message={t('paywall.states.staysFree')}
        action={<Button label={t('paywall.close')} variant="ghost" onPress={close} />}
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
        title={t('paywall.states.plansErrorTitle')}
        message={t('paywall.states.plansErrorMessage')}
        action={<Button label={t('paywall.retry')} variant="ghost" onPress={() => offerings.refetch()} />}
      />
    );
  } else {
    body = (
      <View style={styles.purchase}>
        {choices.length > 1 && (
          <SegmentedControl
            role="radio"
            segments={choices.map((p) => ({ value: p.packageType, label: p.packageType === 'ANNUAL' ? t('paywall.annual') : t('paywall.monthly') }))}
            value={selected.packageType}
            onChange={(value) => {
              if (!busy) setChoice(value); // never switch what's being charged
            }}
          />
        )}
        <View style={styles.priceRow}>
          <Text style={[type.cardTitle, styles.ink]}>
            {renewing ? priceWithPeriod(selected.product) : t('paywall.oneTimePrice', { price: selected.product.priceString })}
          </Text>
          {selected.packageType === 'ANNUAL' && savings ? <StatusPill status="ok" label={t('paywall.save', { percent: savings })} /> : null}
        </View>
        {renewing && intro ? (
          <Text style={[type.secondary, styles.sub]}>{t('paywall.introThen', { intro, price: priceWithPeriod(selected.product) })}</Text>
        ) : null}
        <Button
          label={
            purchase.isPending
              ? t('paywall.processing')
              : !renewing
                ? t('paywall.buy')
                : freeTrial
                  ? t('paywall.startTrial')
                  : t('paywall.subscribe')
          }
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
          <Text style={[type.screenTitle, styles.ink, { flex: 1 }]}>{t('paywall.title')}</Text>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: motion.pressOpacity }, busy && styles.dim]}
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.close')}
            accessibilityState={{ disabled: busy }}
          >
            <MaterialCommunityIcons name="close" size={19} color={ui.ink} />
          </Pressable>
        </View>

        {feature && FEATURE_REASONS.has(feature) ? (
          <Text style={[type.body, styles.sub, styles.reason]}>{t(`paywall.reason.${feature}`)}</Text>
        ) : null}

        <Card style={styles.promise}>
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={ui.success} />
          <Text style={[type.rowTitle, styles.ink, { flex: 1 }]}>
            {t('paywall.promise')}
          </Text>
        </Card>

        <Card>
          {BENEFITS.map((b, i) => (
            <ListRow
              key={b.id}
              icon={b.icon}
              title={t(`paywall.benefits.${b.id}Title`)}
              subtitle={t(`paywall.benefits.${b.id}Subtitle`)}
              last={i === BENEFITS.length - 1}
            />
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
              <Text style={[type.rowTitle, styles.link]}>{restore.isPending ? t('paywall.restoring') : t('paywall.restore')}</Text>
            </Pressable>

            <Text style={[type.secondary, styles.legal]}>{legalText(t, renewing, freeTrial, !!intro)}</Text>
            <View style={styles.legalLinks}>
              <Text style={[type.secondary, styles.link]} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link">
                {t('paywall.terms')}
              </Text>
              <Text style={[type.secondary, styles.legal]}>·</Text>
              <Text style={[type.secondary, styles.link]} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
                {t('paywall.privacy')}
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
