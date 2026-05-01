import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { pets, posts } = useData();

  const upcomingVax = pets.flatMap((p) =>
    (p.vaccinations || []).filter((v) => v.status === 'upcoming' || v.status === 'due_soon' || v.status === 'overdue')
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{user?.name?.split(' ')[0] || 'Friend'} 👋</Text>
        </View>
        <TouchableOpacity style={styles.bell}>
          <MaterialCommunityIcons name="bell-outline" size={22} color={colors.primaryContainer} />
          {upcomingVax.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{upcomingVax.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard icon="paw" value={pets.length} label="My Pets" bg={colors.primaryFixed} fg={colors.primaryContainer} />
          <StatCard icon="needle" value={upcomingVax.length} label="Due Vaccines" bg={colors.tertiaryFixed} fg={colors.tertiary} />
          <StatCard icon="forum-outline" value={posts.length} label="Posts" bg={colors.secondaryFixed} fg={colors.secondary} />
        </View>

        {/* My Pets */}
        <SectionHeader title="My Pets" onPress={() => navigation.navigate('Pets')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petsRow}>
          {pets.map((pet) => (
            <TouchableOpacity
              key={pet.id}
              style={styles.petCard}
              onPress={() => navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: pet.id } })}
            >
              <View style={[styles.petAvatar, { backgroundColor: pet.color || colors.primaryFixed }]}>
                <Text style={styles.petAvatarText}>{pet.name[0]}</Text>
              </View>
              <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
              <Text style={styles.petBreed} numberOfLines={1}>{pet.breed}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.petCard, styles.addCard]}
            onPress={() => navigation.navigate('Pets', { screen: 'AddPet' })}
          >
            <View style={[styles.petAvatar, { backgroundColor: colors.surfaceContainerHigh }]}>
              <MaterialCommunityIcons name="plus" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.petName, { color: colors.primary }]}>Add Pet</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Upcoming vaccinations */}
        {upcomingVax.length > 0 && (
          <>
            <SectionHeader title="Health Alerts" />
            {upcomingVax.slice(0, 3).map((v, i) => (
              <VaxRow key={i} vax={v} />
            ))}
          </>
        )}

        {/* Community preview */}
        <SectionHeader title="Community" onPress={() => navigation.navigate('Community')} />
        {posts.slice(0, 2).map((post) => (
          <PostPreview key={post.id} post={post} />
        ))}
        {posts.length === 0 && (
          <TouchableOpacity style={styles.emptyPost} onPress={() => navigation.navigate('Community')}>
            <MaterialCommunityIcons name="forum-outline" size={32} color={colors.outline} />
            <Text style={styles.emptyText}>Be the first to post!</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label, bg, fg }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon} size={22} color={fg} />
      <Text style={[styles.statVal, { color: fg }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, onPress }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress && (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionLink}>View all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function VaxRow({ vax }) {
  const isOverdue = vax.status === 'overdue';
  const isDue = vax.status === 'due_soon';
  const badgeBg = isOverdue ? colors.errorContainer : isDue ? '#fff0c3' : colors.tertiaryFixed;
  const badgeFg = isOverdue ? colors.onErrorContainer : isDue ? '#7a5c00' : colors.onTertiaryFixed;
  const label = isOverdue ? 'Overdue' : isDue ? 'Due Soon' : 'Upcoming';

  return (
    <View style={styles.vaxRow}>
      <View style={[styles.vaxIcon, { backgroundColor: isOverdue ? colors.errorContainer : colors.tertiaryFixed }]}>
        <MaterialCommunityIcons name="needle" size={18} color={isOverdue ? colors.onErrorContainer : colors.tertiary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.vaxName}>{vax.name}</Text>
        <Text style={styles.vaxDate}>Due: {vax.dueDate}</Text>
      </View>
      <View style={[styles.vaxBadge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.vaxBadgeText, { color: badgeFg }]}>{label}</Text>
      </View>
    </View>
  );
}

function PostPreview({ post }) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: colors.primaryFixed }]}>
          <Text style={styles.postAvatarText}>{(post.authorName || '?')[0]}</Text>
        </View>
        <View>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>
      <View style={styles.postActions}>
        <View style={styles.actionItem}>
          <MaterialCommunityIcons name="paw-outline" size={15} color={colors.outline} />
          <Text style={styles.actionText}>{post.paws} Paws</Text>
        </View>
        <View style={styles.actionItem}>
          <MaterialCommunityIcons name="comment-outline" size={15} color={colors.outline} />
          <Text style={styles.actionText}>{post.comments} Comments</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  greeting: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  name: { ...typography.headlineMd, color: colors.onBackground },
  bell: {
    width: 44, height: 44, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  badge: {
    position: 'absolute', top: 8, right: 8,
    width: 16, height: 16, borderRadius: radii.full,
    backgroundColor: colors.error, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { ...typography.labelSm, color: colors.onError, fontSize: 9 },
  scroll: { paddingBottom: spacing.xl },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.margin, marginBottom: spacing.lg },
  statCard: { flex: 1, padding: spacing.sm, borderRadius: radii.xl, alignItems: 'center', gap: spacing.xs, minHeight: 90, justifyContent: 'center' },
  statVal: { ...typography.headlineMd },
  statLabel: { ...typography.labelSm, color: colors.onSurfaceVariant, textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.margin, marginBottom: spacing.sm, marginTop: spacing.md,
  },
  sectionTitle: { ...typography.titleLg, color: colors.onBackground },
  sectionLink: { ...typography.labelMd, color: colors.secondary },
  petsRow: { paddingHorizontal: spacing.margin, gap: spacing.sm, marginBottom: spacing.sm },
  petCard: {
    backgroundColor: colors.surfaceContainerLowest, borderRadius: radii.xl,
    padding: spacing.sm, alignItems: 'center', width: 110, ...shadows.card,
  },
  addCard: { borderWidth: 2, borderColor: colors.outlineVariant, borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  petAvatar: { width: 56, height: 56, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xs },
  petAvatarText: { ...typography.headlineMd, color: colors.primaryContainer },
  petName: { ...typography.labelMd, color: colors.onSurface },
  petBreed: { ...typography.labelSm, color: colors.onSurfaceVariant, textAlign: 'center' },
  vaxRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.sm,
    borderRadius: radii.xl, marginBottom: spacing.sm, ...shadows.card,
  },
  vaxIcon: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  vaxName: { ...typography.labelMd, color: colors.onSurface },
  vaxDate: { ...typography.labelSm, color: colors.onSurfaceVariant },
  vaxBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.full },
  vaxBadgeText: { ...typography.labelSm },
  postCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, marginBottom: spacing.sm, ...shadows.card,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  postAvatar: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  postAvatarText: { ...typography.titleLg, color: colors.primaryContainer },
  postAuthor: { ...typography.labelMd, color: colors.onSurface },
  postTime: { ...typography.labelSm, color: colors.onSurfaceVariant },
  postContent: { ...typography.bodyMd, color: colors.onSurface, marginBottom: spacing.sm },
  postActions: {
    flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.surfaceContainerHighest,
  },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  emptyPost: {
    marginHorizontal: spacing.margin, padding: spacing.lg,
    borderRadius: radii.xl, borderWidth: 2, borderStyle: 'dashed',
    borderColor: colors.outlineVariant, alignItems: 'center', gap: spacing.sm,
  },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
});
