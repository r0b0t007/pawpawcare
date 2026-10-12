import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { ui, type, motion, photos } from '../../theme';
import { Card, EmptyState, PetFace, ScreenHeader, reminderIcon } from '../../components';
import { useToday } from '../../hooks/useToday';
import { dayDiff, fmtClock, fmtDayTime, timeAgo } from '../../utils/dates';
import { petById } from '../../utils/pets';

// "Lively & Light" notifications: a calm list grouped by when (Today /
// Upcoming / Earlier). Each row leads with the pet's face (or the reminder
// type's icon when it isn't about one pet), so it's recognised before it's
// read. Unread is shown exactly once, as a word ("New") — never colour alone,
// and never the accent, which is kept for actions. Screen readers get each
// row as one element with its actions (mark read / snooze / dismiss) on it.

const actionHit = { top: 10, bottom: 10, left: 8, right: 8 };

// '3h ago', 'Scheduled' for an occurrence that hasn't happened yet, or the
// snooze in plain words — with the day when it isn't today ('Snoozed until
// tomorrow 12:30 AM'), and never a past time dressed up as a future one.
function whenLabel(n, today) {
  if (n.status === 'snoozed') {
    const until = n.snoozed_until ? new Date(n.snoozed_until) : null;
    if (!until || Number.isNaN(until.getTime())) return 'Snoozed';
    if (until.getTime() <= Date.now()) return 'Snooze ended';
    return `Snoozed until ${dayDiff(until, today) === 0 ? fmtClock(until) : fmtDayTime(until, today)}`;
  }
  const at = new Date(n.occurrence_at);
  if (!n.occurrence_at || Number.isNaN(at.getTime())) return '';
  if (at.getTime() > Date.now()) return 'Scheduled';
  return timeAgo(n.occurrence_at);
}

export default function NotificationsScreen({ navigation }) {
  const {
    pets, notifications, unreadCount, refreshNotifications,
    markNotificationRead, snoozeNotification, dismissNotification,
  } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const today = useToday();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }, [refreshNotifications]);

  // Today / Upcoming / Earlier by calendar day, keeping the server's order
  // inside each group. An undated item counts as earlier.
  const sections = useMemo(() => {
    const when = (n) => {
      const at = new Date(n.occurrence_at || n.created_at);
      if (Number.isNaN(at.getTime())) return -1;
      return Math.sign(dayDiff(at, today));
    };
    return [
      { label: 'Today', items: notifications.filter((n) => when(n) === 0) },
      { label: 'Upcoming', items: notifications.filter((n) => when(n) > 0) },
      { label: 'Earlier', items: notifications.filter((n) => when(n) < 0) },
    ].filter((s) => s.items.length > 0);
  }, [notifications, today]);

  const renderRow = (n, i) => {
    const unread = !n.read_at;
    const pet = petById(pets, n.pet_id);
    return (
      <Pressable
        key={n.id}
        style={({ pressed }) => [
          styles.row,
          i > 0 && styles.rowDivider,
          pressed && { backgroundColor: ui.pressTint },
        ]}
        onPress={() => unread && markNotificationRead(n.id)}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'New. ' : ''}${n.title}${n.body ? `. ${n.body}` : ''}. ${whenLabel(n, today)}`}
        // The row is one element for screen readers, so the inline buttons
        // below can't be focused on their own — expose them as actions.
        accessibilityActions={[
          ...(unread ? [{ name: 'activate', label: 'Mark as read' }] : []),
          { name: 'snooze', label: 'Snooze 1 hour' },
          { name: 'dismiss', label: 'Dismiss' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate' && unread) markNotificationRead(n.id);
          else if (nativeEvent.actionName === 'snooze') snoozeNotification(n.id, 60);
          else if (nativeEvent.actionName === 'dismiss') dismissNotification(n.id);
        }}
      >
        {pet ? (
          <PetFace pet={pet} size={40} />
        ) : (
          <View style={styles.typeIcon}>
            <MaterialCommunityIcons name={reminderIcon(n.type)} size={19} color={ui.sub} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle}>{n.title}</Text>
          {n.body ? <Text style={styles.rowBody}>{n.body}</Text> : null}
          <View style={styles.metaRow}>
            {unread && <Text style={styles.newTag}>New</Text>}
            <Text style={styles.rowTime}>
              {[pet?.name, whenLabel(n, today)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.rowActions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => snoozeNotification(n.id, 60)}
              hitSlop={actionHit}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${n.title} for an hour`}
            >
              <MaterialCommunityIcons name="alarm-snooze" size={15} color={ui.accent} />
              <Text style={[styles.actionText, { color: ui.accent }]}>Snooze 1h</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => dismissNotification(n.id)}
              hitSlop={actionHit}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${n.title}`}
            >
              <MaterialCommunityIcons name="check" size={15} color={ui.sub} />
              <Text style={[styles.actionText, { color: ui.sub }]}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        subtitle={notifications.length > 0 ? (unreadCount === 0 ? 'All read' : `${unreadCount} new`) : null}
        onBack={() => navigation.goBack()}
        right={(
          <Pressable
            onPress={() => navigation.navigate('Reminders')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="link"
          >
            <Text style={styles.manageLink}>Manage</Text>
          </Pressable>
        )}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {notifications.length === 0 ? (
          <EmptyState
            photo={photos.emptyBlanket}
            title="You're all caught up"
            body="Reminders for vaccines, meds and care tasks will show up here."
            actionLabel="Add a reminder"
            actionIcon="plus"
            onAction={() => navigation.navigate('Reminders')}
            style={styles.empty}
          />
        ) : (
          sections.map((section) => (
            <View key={section.label}>
              <Text style={[type.sectionLabel, styles.sectionLabel]}>{section.label}</Text>
              <Card style={styles.sectionCard}>{section.items.map(renderRow)}</Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  manageLink: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionLabel: { marginHorizontal: 8, marginBottom: 10, marginTop: 4, color: ui.subtle },
  sectionCard: { marginBottom: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: ui.hairline },
  // Identity, not an action — a neutral chip, never the accent.
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ui.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  // Unread, exactly once, as a word.
  newTag: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    color: ui.ink,
    backgroundColor: ui.track,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowBody: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: ui.sub,
    marginTop: 1,
  },
  rowTime: { ...type.secondary, color: ui.subtle, flexShrink: 1 },
  rowActions: { flexDirection: 'row', gap: 22, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5 },
  empty: { paddingHorizontal: 8, paddingTop: 32 },
});
