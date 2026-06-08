import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function LostPetsScreen({ navigation }) {
  const { lostPets, refreshLostPets, resolveLostPet } = useData();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { refreshLostPets(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLostPets();
    setRefreshing(false);
  }, [refreshLostPets]);

  const onMarkFound = (report) => {
    Alert.alert('Mark as found', `Has ${report.petName} been found safe?`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Found!', onPress: () => resolveLostPet(report.id) },
    ]);
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
        <Text style={styles.headerTitle}>Lost Pets</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryContainer} />}
      >
        {lostPets.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="heart-outline" size={34} color={colors.primaryContainer} />
            </View>
            <Text style={styles.emptyTitle}>No pets reported lost</Text>
            <Text style={styles.emptySub}>Good news — every pet in the community is home safe.</Text>
          </View>
        ) : (
          lostPets.map((r) => {
            const mine = r.reportedBy === user?.id;
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: r.petColor || colors.primaryFixed }]}>
                    <Text style={styles.avatarText}>{(r.petName || '?')[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.petName}>{r.petName}</Text>
                      <View style={styles.lostBadge}>
                        <MaterialCommunityIcons name="alert" size={11} color={colors.onErrorContainer} />
                        <Text style={styles.lostBadgeText}>LOST</Text>
                      </View>
                    </View>
                    <Text style={styles.meta}>
                      {r.petType ? `${r.petType} · ` : ''}reported by {mine ? 'you' : r.reporterName || 'someone'} · {timeAgo(r.createdAt)}
                    </Text>
                  </View>
                </View>

                {r.lastSeenLocation ? (
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={16} color={colors.tertiary} />
                    <Text style={styles.infoText}>Last seen near {r.lastSeenLocation}</Text>
                  </View>
                ) : null}
                {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}

                <View style={styles.actions}>
                  {r.contactPhone ? (
                    <TouchableOpacity
                      style={styles.contactBtn}
                      onPress={() => Linking.openURL(`tel:${r.contactPhone}`)}
                      activeOpacity={0.88}
                    >
                      <MaterialCommunityIcons name="phone" size={15} color={colors.onPrimary} />
                      <Text style={styles.contactBtnText}>Contact owner</Text>
                    </TouchableOpacity>
                  ) : <View style={{ flex: 1 }} />}
                  {mine && (
                    <TouchableOpacity style={styles.foundBtn} onPress={() => onMarkFound(r)} activeOpacity={0.88}>
                      <MaterialCommunityIcons name="check-circle-outline" size={15} color={colors.successFg} />
                      <Text style={styles.foundBtnText}>Mark found</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
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
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.md,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.errorContainer,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  avatarText: { ...typography.headlineMd, fontSize: 20, color: colors.primaryContainer },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  petName: { ...typography.titleLg, color: colors.onSurface, fontSize: 17 },
  lostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.errorContainer,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  lostBadgeText: { ...typography.labelSm, color: colors.onErrorContainer, fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold' },
  meta: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  infoText: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  desc: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryContainer,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    flex: 1,
    ...shadows.button,
  },
  contactBtnText: { ...typography.labelMd, color: colors.onPrimary },
  foundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.successFg,
  },
  foundBtnText: { ...typography.labelMd, color: colors.successFg, fontSize: 13 },
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
