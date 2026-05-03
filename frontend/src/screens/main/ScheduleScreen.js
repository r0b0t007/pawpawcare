import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ScheduleScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { pets } = useData();
  const [activeTab, setActiveTab] = useState('upcoming');

  const now = new Date();

  const allVax = pets.flatMap((pet) =>
    (pet.vaccinations || []).map((v) => ({
      ...v,
      petName: pet.name,
      petColor: pet.color || colors.primaryFixed,
      petId: pet.id,
    }))
  );

  const upcomingVax = allVax
    .filter((v) => v.status !== 'completed')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const completedVax = allVax.filter((v) => v.status === 'completed');

  const allActivities = pets.flatMap((pet) =>
    (pet.activities || []).map((act) => ({
      ...act,
      petName: pet.name,
      petColor: pet.color || colors.primaryFixed,
      petId: pet.id,
    }))
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>My Profile</Text>
            <Text style={styles.subtitle}>{MONTHS[now.getMonth()]} {now.getFullYear()}</Text>
          </View>
        </View>

        {/* User card */}
        <View style={styles.userCard}>
          <View style={[styles.bigAvatar, { backgroundColor: colors.primaryFixed }]}>
            <Text style={styles.bigAvatarText}>{(user?.name || 'U')[0]}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            <View style={styles.statsPills}>
              <StatPill icon="paw" label={`${pets.length} Pet${pets.length !== 1 ? 's' : ''}`} bg={colors.primaryFixed} fg={colors.primaryContainer} />
              <StatPill icon="needle" label={`${upcomingVax.length} Upcoming`} bg={colors.tertiaryFixed} fg={colors.tertiary} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={logout}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="logout" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {[
            { id: 'upcoming', label: 'Vaccines', icon: 'needle' },
            { id: 'activities', label: 'Activities', icon: 'run' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.88}
            >
              <MaterialCommunityIcons
                name={tab.icon}
                size={16}
                color={activeTab === tab.id ? colors.onPrimary : colors.onSurfaceVariant}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'upcoming' && (
          <>
            {upcomingVax.length === 0 ? (
              <EmptyState
                icon="needle"
                title="All caught up!"
                text="No upcoming vaccinations scheduled."
              />
            ) : (
              <View style={styles.list}>
                {upcomingVax.map((vax) => (
                  <VaxItem
                    key={vax.id}
                    vax={vax}
                    onPress={() => navigation.navigate('Pets', { screen: 'VaccinationTracker', params: { petId: vax.petId } })}
                  />
                ))}
              </View>
            )}
            {completedVax.length > 0 && (
              <>
                <SectionLabel label="Completed" />
                <View style={styles.list}>
                  {completedVax.slice(0, 5).map((vax) => <VaxItem key={vax.id} vax={vax} />)}
                </View>
              </>
            )}
          </>
        )}

        {activeTab === 'activities' && (
          <>
            {allActivities.length === 0 ? (
              <EmptyState
                icon="run"
                title="No activities yet"
                text="Add activities from each pet's profile."
              />
            ) : (
              <View style={styles.list}>
                {allActivities.map((act) => (
                  <ActivityItem
                    key={act.id}
                    activity={act}
                    onPress={() => navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: act.petId } })}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Quick Actions */}
        <SectionLabel label="Quick Actions" />
        <View style={styles.quickLinks}>
          <QuickLink icon="paw" label="Pets" color={colors.primaryFixed} fg={colors.primaryContainer} onPress={() => navigation.navigate('Pets')} />
          <QuickLink icon="forum-outline" label="Community" color={colors.secondaryFixed} fg={colors.secondary} onPress={() => navigation.navigate('Community')} />
          <QuickLink icon="view-dashboard-outline" label="Dashboard" color={colors.tertiaryFixed} fg={colors.tertiary} onPress={() => navigation.navigate('Dashboard')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ icon, label, bg, fg }) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon} size={12} color={fg} />
      <Text style={[styles.statPillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function SectionLabel({ label }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelAccent} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.primaryContainer} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function VaxItem({ vax, onPress }) {
  const statusStyles = {
    overdue: { bg: colors.errorContainer, fg: colors.onErrorContainer, label: 'Overdue', dot: colors.error },
    due_soon: { bg: colors.dueSoonBg, fg: colors.dueSoonFg, label: 'Due Soon', dot: '#d4a000' },
    upcoming: { bg: colors.tertiaryFixed, fg: colors.tertiary, label: 'Upcoming', dot: colors.tertiary },
    completed: { bg: colors.successBg, fg: colors.successFg, label: 'Done', dot: colors.successFg },
  };
  const s = statusStyles[vax.status] || statusStyles.upcoming;

  return (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.88 : 1}
    >
      <View style={[styles.itemAvatar, { backgroundColor: vax.petColor }]}>
        <Text style={styles.itemAvatarText}>{vax.petName[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{vax.name}</Text>
        <Text style={styles.itemSub}>{vax.petName} · {vax.dueDate}</Text>
      </View>
      <View style={styles.itemBadgeWrap}>
        <View style={[styles.statusDot, { backgroundColor: s.dot }]} />
        <View style={[styles.itemBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.itemBadgeText, { color: s.fg }]}>{s.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ActivityItem({ activity, onPress }) {
  const timeColors = { morning: colors.primaryFixed, afternoon: colors.tertiaryFixed, evening: colors.surfaceVariant };
  const timeFg = { morning: colors.primaryContainer, afternoon: colors.tertiary, evening: colors.onSurfaceVariant };
  const bg = timeColors[activity.timeOfDay] || colors.primaryFixed;

  return (
    <TouchableOpacity style={styles.itemCard} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.itemAvatar, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name="run" size={16} color={timeFg[activity.timeOfDay] || colors.primaryContainer} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{activity.name}</Text>
        <Text style={styles.itemSub}>{activity.petName} · {activity.duration} min · {activity.timeOfDay}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outlineVariant} />
    </TouchableOpacity>
  );
}

function QuickLink({ icon, label, color, fg, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.quickLink, { backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <MaterialCommunityIcons name={icon} size={24} color={fg} />
      <Text style={[styles.quickLinkText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.headlineMd, color: colors.onBackground },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    padding: spacing.md,
    borderRadius: radii.xl,
    ...shadows.medium,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  bigAvatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.surfaceContainerLowest,
    ...shadows.card,
  },
  bigAvatarText: { ...typography.headlineMd, color: colors.primaryContainer, fontSize: 26 },
  userInfo: { flex: 1, gap: spacing.xs },
  userName: { ...typography.titleLg, color: colors.onSurface },
  userEmail: { ...typography.labelSm, color: colors.onSurfaceVariant },
  statsPills: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statPillText: { ...typography.labelSm, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.errorContainer,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    minHeight: 46,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary, ...shadows.button },
  tabText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onPrimary },
  list: { paddingHorizontal: spacing.margin, gap: spacing.sm },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.margin,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabelAccent: {
    width: 4,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer,
  },
  sectionLabel: { ...typography.titleLg, color: colors.onBackground },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.sm,
    borderRadius: radii.xl,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  itemAvatar: { width: 42, height: 42, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  itemAvatarText: { ...typography.labelMd, color: colors.primaryContainer, fontSize: 16 },
  itemName: { ...typography.labelMd, color: colors.onSurface },
  itemSub: { ...typography.labelSm, color: colors.onSurfaceVariant },
  itemBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 6, height: 6, borderRadius: radii.full },
  itemBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.full },
  itemBadgeText: { ...typography.labelSm, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, paddingTop: spacing.md },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.titleLg, color: colors.onBackground },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 14 },
  quickLinks: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
  },
  quickLink: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  quickLinkText: { ...typography.labelMd, fontSize: 12 },
});
