import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { ui, type } from '../../theme';
import { Card, Button } from '../../components';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 0) return 'scheduled';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Dot encodes state exactly once: unread = danger red, snoozed-unread = amber,
// read = faint.
function dotColor(n) {
  if (n.read_at) return ui.faint;
  return n.status === 'snoozed' ? '#b06e00' : ui.danger;
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Notifications</Text>
        <Pressable onPress={() => navigation.navigate('Reminders')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.manageLink}>Manage</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={34} color={ui.accent} />
            </View>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptySub}>Reminders for vaccinations and care tasks will show up here.</Text>
            <Button
              pill
              label="Add a reminder"
              icon="plus"
              onPress={() => navigation.navigate('Reminders')}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : (
          <Card>
            {notifications.map((n, i) => {
              const unread = !n.read_at;
              return (
                <Pressable
                  key={n.id}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowDivider,
                    pressed && { backgroundColor: ui.background },
                  ]}
                  onPress={() => unread && markNotificationRead(n.id)}
                >
                  <View style={[styles.dot, { backgroundColor: dotColor(n) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText}>
                      <Text style={styles.rowLead}>{n.title}</Text>
                      {n.body ? ` — ${n.body}` : ''}
                    </Text>
                    <Text style={styles.rowTime}>
                      {n.status === 'snoozed' ? 'Snoozed' : timeAgo(n.occurrence_at)}
                    </Text>
                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => snoozeNotification(n.id, 60)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="alarm-snooze" size={15} color={ui.accent} />
                        <Text style={[styles.actionText, { color: ui.accent }]}>Snooze 1h</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => dismissNotification(n.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="check" size={15} color={ui.sub} />
                        <Text style={[styles.actionText, { color: ui.sub }]}>Dismiss</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.screenTitle, flex: 1, color: ui.ink },
  manageLink: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.hairline },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  rowText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: ui.sub,
  },
  rowLead: { fontFamily: 'PlusJakartaSans_700Bold', color: ui.ink },
  rowTime: { ...type.secondary, color: ui.subtle, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 20, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5 },
  empty: { alignItems: 'center', paddingTop: 56, gap: 10 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: { ...type.cardTitle, color: ui.ink },
  emptySub: { ...type.body, color: ui.sub, textAlign: 'center', paddingHorizontal: 24 },
});
