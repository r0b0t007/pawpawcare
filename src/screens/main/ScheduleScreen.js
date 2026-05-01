import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthName(i) { return MONTHS[i]; }

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
            <Text style={styles.title}>Schedule</Text>
            <Text style={styles.subtitle}>{getMonthName(now.getMonth())} {now.getFullYear()}</Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={logout}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primaryFixed }]}>
              <Text style={styles.profileAvatarText}>{(user?.name || 'U')[0]}</Text>
            </View>
          </TouchableOpacity>
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
              <View style={styles.pill}>
                <MaterialCommunityIcons name="paw" size={12} color={colors.primaryContainer} />
                <Text style={styles.pillText}>{pets.length} Pet{pets.length !== 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.pill}>
                <MaterialCommunityIcons name="needle" size={12} color={colors.tertiary} />
                <Text style={styles.pillText}>{upcomingVax.length} Upcoming</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <MaterialCommunityIcons name="logout" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {[
            { id: 'upcoming', label: 'Vaccines', icon: 'needle' },
            { id: 'activities', label: 'Activities', icon: 'run' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <MaterialCommunityIcons name={tab.icon} size={16} color={activeTab === tab.id ? colors.onPrimary : colors.onSurfaceVariant} />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'upcoming' && (
          <>
            {upcomingVax.length === 0 ? (
              <EmptyState icon="needle" text="No upcoming vaccinations!" />
            ) : (
              <View style={styles.list}>
                {upcomingVax.map((vax) => <VaxItem key={vax.id} vax={vax} onPress={() => navigation.navigate('Pets', { screen: 'VaccinationTracker', params: { petId: vax.petId } })} />)}
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
              <EmptyState icon="run" text="No activities yet. Add some from pet profiles!" />
            ) : (
              <View style={styles.list}>
                {allActivities.map((act) => <ActivityItem key={act.id} activity={act} onPress={() => navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: act.petId } })} />)}
              </View>
            )}
          </>
        )}

        {/* Quick links */}
        <SectionLabel label="Quick Actions" />
        <View style={styles.quickLinks}>
          <QuickLink icon="paw" label="My Pets" color={colors.primaryFixed} fg={colors.primaryContainer} onPress={() => navigation.navigate('Pets')} />
          <QuickLink icon="forum-outline" label="Community" color={colors.secondaryFixed} fg={colors.secondary} onPress={() => navigation.navigate('Community')} />
          <QuickLink icon="view-dashboard" label="Dashboard" color={colors.tertiaryFixed} fg={colors.tertiary} onPress={() => navigation.navigate('Dashboard')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label }) {
  return <Text style={[styles.sectionLabel, { paddingHorizontal: spacing.margin, marginTop: spacing.lg, marginBottom: spacing.sm }]}>{label}</Text>;
}

function EmptyState({ icon, text }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={36} color={colors.outline} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function VaxItem({ vax, onPress }) {
  const statusColors = {
    overdue: { bg: colors.errorContainer, fg: colors.onErrorContainer },
    due_soon: { bg: '#fff0c3', fg: '#7a5c00' },
    upcoming: { bg: colors.tertiaryFixed, fg: colors.tertiary },
    completed: { bg: colors.secondaryFixed, fg: colors.secondary },
  };
  const s = statusColors[vax.status] || statusColors.upcoming;
  const label = { overdue: 'Overdue', due_soon: 'Due Soon', upcoming: 'Upcoming', completed: 'Done' }[vax.status] || '';

  return (
    <TouchableOpacity style={styles.itemCard} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.8 : 1}>
      <View style={[styles.itemDot, { backgroundColor: vax.petColor }]}>
        <Text style={styles.itemDotText}>{vax.petName[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{vax.name}</Text>
        <Text style={styles.itemSub}>{vax.petName} • {vax.dueDate}</Text>
      </View>
      <View style={[styles.itemBadge, { backgroundColor: s.bg }]}>
        <Text style={[styles.itemBadgeText, { color: s.fg }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ActivityItem({ activity, onPress }) {
  const timeColors = { morning: colors.primaryFixed, afternoon: colors.tertiaryFixed, evening: colors.surfaceVariant };
  const bg = timeColors[activity.timeOfDay] || colors.primaryFixed;

  return (
    <TouchableOpacity style={styles.itemCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.itemDot, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name="run" size={16} color={colors.primaryContainer} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{activity.name}</Text>
        <Text style={styles.itemSub}>{activity.petName} • {activity.duration} mins • {activity.timeOfDay}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outlineVariant} />
    </TouchableOpacity>
  );
}

function QuickLink({ icon, label, color, fg, onPress }) {
  return (
    <TouchableOpacity style={[styles.quickLink, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <MaterialCommunityIcons name={icon} size={24} color={fg} />
      <Text style={[styles.quickLinkText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.headlineMd, color: colors.onBackground },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  profileBtn: {},
  profileAvatar: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { ...typography.titleLg, color: colors.primaryContainer },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, ...shadows.card, marginBottom: spacing.md,
  },
  bigAvatar: { width: 60, height: 60, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  bigAvatarText: { ...typography.headlineMd, color: colors.primaryContainer },
  userInfo: { flex: 1 },
  userName: { ...typography.titleLg, color: colors.onSurface },
  userEmail: { ...typography.labelSm, color: colors.onSurfaceVariant, marginBottom: spacing.xs },
  statsPills: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceContainerLow, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, borderRadius: radii.full,
  },
  pillText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  logoutBtn: {
    width: 36, height: 36, borderRadius: radii.full,
    backgroundColor: colors.errorContainer, justifyContent: 'center', alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.margin, marginBottom: spacing.sm,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onPrimary },
  list: { paddingHorizontal: spacing.margin, gap: spacing.sm },
  sectionLabel: { ...typography.titleLg, color: colors.onBackground },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest, padding: spacing.sm,
    borderRadius: radii.xl, ...shadows.card,
  },
  itemDot: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  itemDotText: { ...typography.labelMd, color: colors.primaryContainer },
  itemName: { ...typography.labelMd, color: colors.onSurface },
  itemSub: { ...typography.labelSm, color: colors.onSurfaceVariant },
  itemBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.full },
  itemBadgeText: { ...typography.labelSm },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, paddingTop: spacing.md },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center' },
  quickLinks: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.margin,
  },
  quickLink: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radii.xl,
    alignItems: 'center', gap: spacing.xs,
  },
  quickLinkText: { ...typography.labelMd },
});
