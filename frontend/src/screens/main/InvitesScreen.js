import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const TYPE_ICON = {
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
};

export default function InvitesScreen({ navigation }) {
  const { invites, refreshInvites, acceptInvite, declineInvite } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshInvites();
    setRefreshing(false);
  }, [refreshInvites]);

  const respond = async (id, action) => {
    setBusyId(id);
    if (action === 'accept') await acceptInvite(id);
    else await declineInvite(id);
    setBusyId(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onBackground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invitations</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryContainer} />}
      >
        {invites.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="email-heart-outline" size={34} color={colors.primaryContainer} />
            </View>
            <Text style={styles.emptyTitle}>No pending invitations</Text>
            <Text style={styles.emptySub}>When someone shares a pet with you, the invite will appear here.</Text>
          </View>
        ) : (
          invites.map((inv) => (
            <View key={inv.id} style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons
                  name={TYPE_ICON[inv.petType] || 'paw'}
                  size={22}
                  color={colors.primaryContainer}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  <Text style={styles.bold}>{inv.inviterName}</Text> invited you to co-own{' '}
                  <Text style={styles.bold}>{inv.petName}</Text>
                </Text>
                {!!inv.inviterEmail && <Text style={styles.rowSub}>{inv.inviterEmail}</Text>}
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={[styles.acceptBtn, busyId === inv.id && styles.btnDisabled]}
                    disabled={busyId === inv.id}
                    onPress={() => respond(inv.id, 'accept')}
                    activeOpacity={0.88}
                  >
                    <MaterialCommunityIcons name="check" size={16} color={colors.onPrimary} />
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.declineBtn, busyId === inv.id && styles.btnDisabled]}
                    disabled={busyId === inv.id}
                    onPress={() => respond(inv.id, 'decline')}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { ...typography.titleLg, color: colors.onBackground },
  scroll: { paddingHorizontal: spacing.margin, paddingBottom: spacing.xl, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.md,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  bold: { ...typography.labelMd, color: colors.onSurface },
  rowSub: { ...typography.labelSm, color: colors.outline, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    ...shadows.button,
  },
  acceptText: { ...typography.labelMd, color: colors.onPrimary },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
  },
  declineText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  btnDisabled: { opacity: 0.5 },
  empty: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.titleLg, color: colors.onBackground },
  emptySub: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: spacing.md },
});
