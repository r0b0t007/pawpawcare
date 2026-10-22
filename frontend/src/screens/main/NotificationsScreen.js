import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { ui, type, motion, photos } from '../../theme';
import { Card, EmptyState, PetFace, ScreenHeader, reminderIcon, NotificationsBanner } from '../../components';
import { useToday } from '../../hooks/useToday';
import { useNotificationsQuery } from '../../hooks/useNotifications';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { dayDiff, fmtClock, fmtDayTime, timeAgo } from '../../utils/dates';
import i18n, { useLocale, useTranslation } from '../../i18n';
import { petById } from '../../utils/pets';

// Stable while the list hasn't loaded, so the sections memo doesn't rerun.
const NONE = [];

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
    if (!until || Number.isNaN(until.getTime())) return i18n.t('notifications.when.snoozed');
    if (until.getTime() <= Date.now()) return i18n.t('notifications.when.snoozeEnded');
    return i18n.t('notifications.when.snoozedUntil', {
      time: dayDiff(until, today) === 0 ? fmtClock(until) : fmtDayTime(until, today),
    });
  }
  const at = new Date(n.occurrence_at);
  if (!n.occurrence_at || Number.isNaN(at.getTime())) return '';
  if (at.getTime() > Date.now()) return i18n.t('notifications.when.scheduled');
  return timeAgo(n.occurrence_at);
}

export default function NotificationsScreen({ navigation }) {
  // Re-render dates and times when the app language changes: this screen
  // can stay mounted under another tab while the language is switched.
  useLocale();
  const { t } = useTranslation();
  const {
    pets, markNotificationRead, snoozeNotification, dismissNotification,
  } = useData();
  const {
    data, isLoading, isError, isFetching, refetch,
  } = useNotificationsQuery();
  // Reminders fire and pushes arrive while the app is elsewhere: re-read
  // whenever the list is shown again.
  useRefetchOnFocus(refetch);
  const notifications = data?.notifications ?? NONE;
  const unreadCount = data?.unreadCount ?? 0;
  // A retry after a failed load is a fetch with the error still set: show it
  // as loading, not as the unchanged error.
  const retrying = isError && isFetching;
  const [refreshing, setRefreshing] = useState(false);
  const today = useToday();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Today / Upcoming / Earlier by calendar day. The server sends newest
  // first, which suits Today and Earlier; Upcoming reads soonest first.
  // An undated item counts as earlier.
  const sections = useMemo(() => {
    const at = (n) => new Date(n.occurrence_at || n.created_at);
    const when = (n) => {
      const d = at(n);
      if (Number.isNaN(d.getTime())) return -1;
      return Math.sign(dayDiff(d, today));
    };
    const upcoming = notifications.filter((n) => when(n) > 0).sort((a, b) => at(a) - at(b));
    return [
      { id: 'today', label: t('notifications.sections.today'), items: notifications.filter((n) => when(n) === 0) },
      { id: 'upcoming', label: t('notifications.sections.upcoming'), items: upcoming },
      { id: 'earlier', label: t('notifications.sections.earlier'), items: notifications.filter((n) => when(n) < 0) },
    ].filter((s) => s.items.length > 0);
  }, [notifications, today, t]);

  const renderRow = (n, i) => {
    const unread = !n.read_at;
    const pet = petById(pets, n.pet_id);
    const when = whenLabel(n, today);
    const content = n.body
      ? t('notifications.rowA11yBody', { title: n.title, body: n.body, when })
      : t('notifications.rowA11y', { title: n.title, when });
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
        accessibilityLabel={unread ? t('notifications.newA11y', { content }) : content}
        // The row is one element for screen readers, so the inline buttons
        // below can't be focused on their own — expose them as actions.
        accessibilityActions={[
          ...(unread ? [{ name: 'activate', label: t('notifications.actions.markRead') }] : []),
          { name: 'snooze', label: t('notifications.actions.snoozeHour') },
          { name: 'dismiss', label: t('notifications.actions.dismiss') },
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
            {unread && <Text style={styles.newTag}>{t('notifications.new')}</Text>}
            <Text style={styles.rowTime}>
              {[pet?.name, when].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.rowActions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => snoozeNotification(n.id, 60)}
              hitSlop={actionHit}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.snoozeA11y', { title: n.title })}
            >
              <MaterialCommunityIcons name="alarm-snooze" size={15} color={ui.accent} />
              <Text style={[styles.actionText, { color: ui.accent }]}>{t('notifications.snoozeShort')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => dismissNotification(n.id)}
              hitSlop={actionHit}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.dismissA11y', { title: n.title })}
            >
              <MaterialCommunityIcons name="check" size={15} color={ui.sub} />
              <Text style={[styles.actionText, { color: ui.sub }]}>{t('notifications.actions.dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={t('notifications.title')}
        subtitle={notifications.length > 0
          ? (unreadCount === 0 ? t('notifications.allRead') : t('notifications.newCount', { count: unreadCount }))
          : null}
        onBack={() => navigation.goBack()}
        right={(
          <Pressable
            onPress={() => navigation.navigate('Reminders')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="link"
          >
            <Text style={styles.manageLink}>{t('notifications.manage')}</Text>
          </Pressable>
        )}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        <NotificationsBanner style={styles.banner} />
        {notifications.length === 0 && (isLoading || retrying) && (
          <ActivityIndicator color={ui.accent} style={styles.loading} accessibilityLabel={t('common.loading')} />
        )}
        {notifications.length === 0 && isError && !retrying && (
          <EmptyState
            compact
            title={t('notifications.loadFailed')}
            actionLabel={t('common.retry')}
            actionIcon="refresh"
            onAction={() => refetch()}
            style={styles.empty}
          />
        )}
        {notifications.length === 0 && !isLoading && !isError && (
          <EmptyState
            photo={photos.emptyBlanket}
            title={t('notifications.empty.title')}
            body={t('notifications.empty.body')}
            actionLabel={t('notifications.empty.action')}
            actionIcon="plus"
            onAction={() => navigation.navigate('Reminders')}
            style={styles.empty}
          />
        )}
        {notifications.length > 0 && (
          sections.map((section) => (
            <View key={section.id}>
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
  banner: { marginBottom: 12 },
  loading: { paddingVertical: 36 },
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
