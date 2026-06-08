import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const TYPE_ICON = {
  vaccination: 'needle',
  medication: 'pill',
  activity: 'run',
  custom: 'bell-ring-outline',
};

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 0) return 'scheduled';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsScreen({ navigation }) {
  const {
    notifications, refreshNotifications,
    markNotificationRead, snoozeNotification, dismissNotification,
  } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }, [refreshNotifications]);

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
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Reminders')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.manageLink}>Manage</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryContainer} />}
      >
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={34} color={colors.primaryContainer} />
            </View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptySub}>Reminders for vaccinations and care tasks will show up here.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Reminders')} activeOpacity={0.88}>
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
              <Text style={styles.emptyBtnText}>Add a reminder</Text>
            </TouchableOpacity>
          </View>
        ) : (
          notifications.map((n) => {
            const unread = !n.read_at;
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.row, unread && styles.rowUnread]}
                activeOpacity={0.85}
                onPress={() => unread && markNotificationRead(n.id)}
              >
                <View style={[styles.rowIcon, { backgroundColor: unread ? colors.primaryFixed : colors.surfaceContainerHigh }]}>
                  <MaterialCommunityIcons
                    name={TYPE_ICON[n.type] || 'bell-outline'}
                    size={20}
                    color={colors.primaryContainer}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                    {unread && <View style={styles.dot} />}
                  </View>
                  {!!n.body && <Text style={styles.rowBody} numberOfLines={2}>{n.body}</Text>}
                  <Text style={styles.rowTime}>
                    {n.status === 'snoozed' ? 'Snoozed' : timeAgo(n.occurrence_at)}
                  </Text>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => snoozeNotification(n.id, 60)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="alarm-snooze" size={16} color={colors.secondary} />
                      <Text style={[styles.actionText, { color: colors.secondary }]}>Snooze 1h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => dismissNotification(n.id)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="check" size={16} color={colors.outline} />
                      <Text style={[styles.actionText, { color: colors.outline }]}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
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
  manageLink: { ...typography.labelMd, color: colors.secondary },
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
  rowUnread: { borderColor: colors.primaryFixedDim },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...typography.labelMd, color: colors.onSurface, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: colors.error },
  rowBody: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant, marginTop: 2 },
  rowTime: { ...typography.labelSm, color: colors.outline, marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.labelSm },
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
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    marginTop: spacing.sm,
    ...shadows.button,
  },
  emptyBtnText: { ...typography.labelMd, color: colors.onPrimary },
});
