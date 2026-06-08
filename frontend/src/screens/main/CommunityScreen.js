import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const AVATAR_COLORS = ['#ffddb8', '#c5e7ff', '#d8e2ff', '#b2f2d4', '#ffd6e7', '#fff3b0'];
function avatarColor(name) {
  const i = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[i];
}

const GROUP_COLORS = [
  { bg: '#ffddb8', accent: '#855300', icon: 'dog' },
  { bg: '#c5e7ff', accent: '#004c6a', icon: 'cat' },
  { bg: '#d8e2ff', accent: '#085ac0', icon: 'bird' },
  { bg: '#b2f2d4', accent: '#1a6b3a', icon: 'rabbit' },
  { bg: '#ffd6e7', accent: '#8b1a4a', icon: 'paw' },
];

export default function CommunityScreen({ navigation }) {
  const { user } = useAuth();
  const { posts, groups, togglePaw, addPost, toggleGroupMembership, lostPets } = useData();
  const [draft, setDraft] = useState('');

  const handlePost = async () => {
    if (!draft.trim()) return;
    await addPost(draft.trim());
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Community</Text>
            <Text style={styles.subtitle}>Connect with fellow pet owners</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.primaryFixed }]}>
            <MaterialCommunityIcons name="account-group-outline" size={22} color={colors.primaryContainer} />
          </View>
        </View>

        {/* Lost Pets board entry */}
        <TouchableOpacity
          style={styles.lostBanner}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('LostPets')}
        >
          <View style={styles.lostBannerIcon}>
            <MaterialCommunityIcons name="map-marker-alert-outline" size={22} color={colors.onErrorContainer} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lostBannerTitle}>Lost Pets Board</Text>
            <Text style={styles.lostBannerSub}>
              {lostPets && lostPets.length > 0
                ? `${lostPets.length} pet${lostPets.length > 1 ? 's' : ''} missing nearby — help reunite them`
                : 'Report a missing pet or help reunite one'}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onErrorContainer} />
        </TouchableOpacity>

        {/* Join the Pack */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Join the Pack</Text>
          <Text style={styles.groupCount}>{groups.filter(g => g.isJoined).length}/{groups.length} joined</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupsRow}>
          {groups.map((group, idx) => (
            <GroupCard key={group.id} group={group} palette={GROUP_COLORS[idx % GROUP_COLORS.length]} onToggle={() => toggleGroupMembership(group.id)} />
          ))}
        </ScrollView>

        {/* Create Post */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Share a Moment</Text>
        </View>
        <View style={styles.createPost}>
          <View style={[styles.createAvatar, { backgroundColor: avatarColor(user?.name) }]}>
            <Text style={styles.createAvatarText}>{(user?.name || 'U')[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.createInput}
              placeholder="What's your pet up to?"
              placeholderTextColor={colors.outlineVariant}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
            onPress={handlePost}
            disabled={!draft.trim()}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="send" size={17} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {/* Feed */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Feed</Text>
          {posts.length > 0 && (
            <Text style={styles.feedCount}>{posts.length} post{posts.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} userId={user?.id} onPaw={() => togglePaw(post.id)} />
        ))}
        {posts.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIllustration}>
              <MaterialCommunityIcons name="forum-outline" size={36} color={colors.primaryContainer} />
            </View>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>Be the first to share a moment with your pet!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function GroupCard({ group, palette, onToggle }) {
  const joined = group.isJoined;
  return (
    <View style={styles.groupCard}>
      <View style={[styles.groupBanner, { backgroundColor: palette.bg }]}>
        <MaterialCommunityIcons name={palette.icon} size={30} color={palette.accent} />
      </View>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName} numberOfLines={2}>{group.name}</Text>
        <View style={styles.groupMeta}>
          <MaterialCommunityIcons name="account-multiple-outline" size={12} color={colors.onSurfaceVariant} />
          <Text style={styles.groupMetaText}>{group.members} members</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.joinBtn, joined && styles.joinBtnActive]}
        onPress={onToggle}
        activeOpacity={0.88}
      >
        {joined
          ? <MaterialCommunityIcons name="check" size={14} color={colors.primaryContainer} />
          : null
        }
        <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
          {joined ? 'Joined' : 'Join'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function PostCard({ post, userId, onPaw }) {
  const hasPawed = !!post.pawedByMe;
  const bg = avatarColor(post.authorName);

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: bg }]}>
          <Text style={styles.postAvatarText}>{(post.authorName || '?')[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      <View style={styles.postDivider} />
      <View style={styles.postActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPaw} activeOpacity={0.85}>
          <MaterialCommunityIcons
            name={hasPawed ? 'paw' : 'paw-outline'}
            size={18}
            color={hasPawed ? colors.primaryContainer : colors.onSurfaceVariant}
          />
          <Text style={[styles.actionText, hasPawed && { color: colors.primaryContainer }]}>
            {post.paws} {post.paws === 1 ? 'Paw' : 'Paws'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85}>
          <MaterialCommunityIcons name="comment-outline" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.actionText}>{post.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { marginLeft: 'auto' }]} activeOpacity={0.85}>
          <MaterialCommunityIcons name="share-outline" size={18} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.headlineMd, color: colors.onBackground },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.margin,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: '#fff1f0',
    borderWidth: 1,
    borderColor: colors.errorContainer,
  },
  lostBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.errorContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lostBannerTitle: { ...typography.labelMd, color: colors.onSurface },
  lostBannerSub: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.margin,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.titleLg, color: colors.onBackground },
  groupCount: { ...typography.labelSm, color: colors.onSurfaceVariant },
  feedCount: { ...typography.labelSm, color: colors.onSurfaceVariant },
  groupsRow: { paddingHorizontal: spacing.margin, gap: spacing.sm, paddingBottom: spacing.sm },
  groupCard: {
    width: 158,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  groupBanner: {
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: { padding: spacing.sm, gap: spacing.xs },
  groupName: { ...typography.labelMd, color: colors.onSurface, lineHeight: 18 },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupMetaText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  joinBtn: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  joinBtnActive: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryFixedDim },
  joinBtnText: { ...typography.labelMd, color: colors.primaryContainer, fontSize: 13 },
  joinBtnTextActive: { color: colors.primaryContainer },
  createPost: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    padding: spacing.md,
    borderRadius: radii.xl,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  createAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  createAvatarText: { ...typography.titleLg, color: colors.primaryContainer, fontSize: 16 },
  createInput: {
    ...typography.bodyMd,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    ...shadows.button,
  },
  sendBtnDisabled: { backgroundColor: colors.surfaceContainerHigh, shadowOpacity: 0, elevation: 0 },
  postCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    padding: spacing.md,
    borderRadius: radii.xl,
    marginBottom: spacing.sm,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  postAvatar: { width: 44, height: 44, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  postAvatarText: { ...typography.titleLg, color: colors.primaryContainer, fontSize: 16 },
  postAuthor: { ...typography.labelMd, color: colors.onSurface },
  postTime: { ...typography.labelSm, color: colors.onSurfaceVariant },
  moreBtn: { padding: spacing.xs },
  postContent: { ...typography.bodyMd, color: colors.onSurface, marginBottom: spacing.sm, lineHeight: 22 },
  postDivider: { height: 1, backgroundColor: colors.surfaceContainerHighest, marginBottom: spacing.sm },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.labelMd, color: colors.onSurfaceVariant, fontSize: 13 },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.titleLg, color: colors.onBackground },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 14 },
});
