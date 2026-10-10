import React from 'react';
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePlan, useRestore } from '../../hooks/useSubscription';
import { getManagementUrl } from '../../services/purchases';
import { isRenewingStoreSubscription, isStoreBilled, planStatus, storeName } from '../../utils/subscription';
import { ui, type, radii, motion } from '../../theme';
import { Card, ListRow, StatusPill, Button, showToast } from '../../components';

// Profile → Subscription. The plan comes from the server (/users/me); billing
// itself lives in the user's App Store / Google Play account, so managing or
// cancelling opens the store. Status is shown once, in the pill.

export default function SubscriptionScreen({ navigation }) {
  const { plan, included, canPurchase } = usePlan();
  const restore = useRestore();
  const status = planStatus(plan);
  const storeBilled = isStoreBilled(plan);

  const openManagement = async () => {
    const url = await getManagementUrl();
    if (url) Linking.openURL(url).catch(() => showToast("Couldn't open the store — try from its settings"));
    else showToast('Manage it from your app store settings');
  };

  const handleRestore = async () => {
    try {
      const result = await restore.mutateAsync();
      showToast(
        result.plan?.active
          ? 'Purchases restored'
          : result.synced === false
            ? 'Restored — it may take a minute to show up'
            : 'No purchases found to restore',
      );
    } catch (_) {
      showToast("Couldn't restore purchases — try again");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Subscription</Text>
        </View>

        <Card style={styles.planCard}>
          <Text style={[type.cardTitle, styles.ink]}>
            {plan.active ? 'PawPawCare Plus' : included ? 'Plus features included' : 'Free plan'}
          </Text>
          {status ? <StatusPill status={status.status} label={status.label} /> : null}
          <Text style={[type.body, styles.sub]}>
            {plan.active
              ? plan.billing_issue
                ? `${storeName(plan.store)} couldn't charge your payment method. Update it there to keep Plus.`
                : 'Thanks for supporting PawPawCare.'
              : plan.grandfathered
                ? 'As an early member, Plus features are included for you.'
                : 'Your pets, records and exports are free forever.'}
          </Text>
          {!included && canPurchase ? (
            <Button label="See PawPawCare Plus" onPress={() => navigation.navigate('Paywall')} />
          ) : null}
        </Card>

        {storeBilled || canPurchase ? (
        <Card style={styles.sectionCard}>
          {plan.billing_issue && storeBilled ? (
            <ListRow icon="credit-card-outline" title="Update payment method" chevron onPress={openManagement} />
          ) : null}
          {storeBilled ? (
            <ListRow
              icon="cog-outline"
              title="Manage subscription"
              subtitle={`Change or cancel in ${storeName(plan.store)}`}
              chevron
              onPress={openManagement}
              last={!canPurchase}
            />
          ) : null}
          {canPurchase ? (
            <ListRow
              icon="restore"
              title={restore.isPending ? 'Restoring…' : 'Restore purchases'}
              subtitle="Bought on another device or account"
              onPress={restore.isPending ? undefined : handleRestore}
              last
            />
          ) : null}
        </Card>
        ) : null}

        {isRenewingStoreSubscription(plan) ? (
          <Text style={[type.secondary, styles.caption]}>
            Deleting your PawPawCare account doesn't cancel billing — cancel in {storeName(plan.store)} first.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, marginBottom: 26 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, letterSpacing: -0.3, color: ui.ink },
  ink: { color: ui.ink },
  sub: { color: ui.sub },
  planCard: { marginHorizontal: 24, marginBottom: 22, padding: 18, gap: 12 },
  sectionCard: { marginHorizontal: 24, marginBottom: 12 },
  caption: { color: ui.subtle, marginHorizontal: 24 },
});
