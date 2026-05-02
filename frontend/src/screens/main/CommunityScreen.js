import React, { useState } from 'react'; // useState used for draft post input
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, FlatList, KeyboardAvoidingView, Platform,
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

export default function CommunityScreen() {
  const { user } = useAuth();
  const { posts, groups, togglePaw, addPost, toggleGroupMembership } = useData();
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
          <Text style={styles.title}>Community</Text>
          <Text style={styles.subtitle}>Connect with fellow pet owners</Text>
        </View>

        {/* Join the Pack */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Join the Pack</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>View all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupsRow}>
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} onToggle={() => toggleGroupMembership(group.id)} />
          ))}
        </ScrollView>

        {/* Create Post */}
        <View style={styles.createPost}>
          <View style={[styles.createAvatar, { backgroundColor: avatarColor(user?.name) }]}>
            <Text style={styles.createAvatarText}>{(user?.name || 'U')[0]}</Text>
          </View>
          <TextInput
            style={styles.createInput}
            placeholder="Share a moment with your pet..."
            placeholderTextColor={colors.onSurfaceVariant}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          {draft.trim().length > 0 && (
            <TouchableOpacity style={styles.sendBtn} onPress={handlePost}>
              <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Feed */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Feed</Text>
        </View>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} userId={user?.id} onPaw={() => togglePaw(post.id)} />
        ))}
        {posts.length === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="forum-outline" size={40} color={colors.outline} />
            <Text style={styles.emptyText}>No posts yet. Be the first!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function GroupCard({ group, onToggle }) {
  const groupColors = ['#ffddb8', '#c5e7ff', '#d8e2ff'];
  const bg = groupColors[group.id.charCodeAt(1) % groupColors.length] || '#ffddb8';
  const joined = group.isJoined;

  return (
    <View style={[styles.groupCard, { borderTopWidth: 3, borderTopColor: '#855300' }]}>
      <View style={[styles.groupBanner, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name="paw" size={28} color={colors.primaryContainer} />
      </View>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName} numberOfLines={2}>{group.name}</Text>
        <View style={styles.groupMeta}>
          <MaterialCommunityIcons name="account-group-outline" size={12} color={colors.onSurfaceVariant} />
          <Text style={styles.groupMetaText}>{group.members} members</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.joinBtn, joined && styles.joinBtnActive]}
        onPress={onToggle}
      >
        <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
          {joined ? 'Joined ✓' : 'Join Group'}
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
        <TouchableOpacity style={styles.moreBtn}>
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      <View style={styles.postDivider} />
      <View style={styles.postActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPaw}>
          <MaterialCommunityIcons
            name={hasPawed ? 'paw' : 'paw-outline'}
            size={18}
            color={hasPawed ? colors.primaryContainer : colors.onSurfaceVariant}
          />
          <Text style={[styles.actionText, hasPawed && { color: colors.primaryContainer }]}>
            {post.paws} Paws
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <MaterialCommunityIcons name="comment-outline" size={18} color={colors.onSurfaceVariant} />
          <Text style={styles.actionText}>{post.comments} Comments</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { marginLeft: 'auto' }]}>
          <MaterialCommunityIcons name="share-outline" size={18} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  header: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...typography.headlineMd, color: colors.onBackground },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.margin, marginBottom: spacing.sm, marginTop: spacing.md,
  },
  sectionTitle: { ...typography.titleLg, color: colors.onBackground },
  seeAll: { ...typography.labelMd, color: colors.secondary },
  groupsRow: { paddingHorizontal: spacing.margin, gap: spacing.sm, paddingBottom: spacing.sm },
  groupCard: {
    width: 160, backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl, overflow: 'hidden', ...shadows.card,
  },
  groupBanner: {
    height: 70, justifyContent: 'center', alignItems: 'center',
  },
  groupInfo: { padding: spacing.sm, gap: spacing.xs, flex: 1 },
  groupName: { ...typography.labelMd, color: colors.onSurface },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  groupMetaText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  joinBtn: {
    marginHorizontal: spacing.sm, marginBottom: spacing.sm, paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.lg, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  joinBtnActive: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryFixed },
  joinBtnText: { ...typography.labelMd, color: colors.primaryContainer },
  joinBtnTextActive: { color: colors.primaryContainer },
  createPost: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, ...shadows.card,
    borderWidth: 1, borderColor: colors.surfaceVariant,
  },
  createAvatar: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  createAvatarText: { ...typography.titleLg, color: colors.primaryContainer },
  createInput: {
    flex: 1, ...typography.bodyMd, color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: radii.full,
    backgroundColor: colors.primaryContainer, justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  postCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, marginBottom: spacing.sm, ...shadows.card,
    borderWidth: 1, borderColor: colors.surfaceVariant,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  postAvatar: { width: 44, height: 44, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  postAvatarText: { ...typography.titleLg, color: colors.primaryContainer },
  postAuthor: { ...typography.labelMd, color: colors.onSurface },
  postTime: { ...typography.labelSm, color: colors.onSurfaceVariant },
  moreBtn: { padding: spacing.xs },
  postContent: { ...typography.bodyMd, color: colors.onSurface, marginBottom: spacing.sm, lineHeight: 22 },
  postDivider: { height: 1, backgroundColor: colors.surfaceContainerHighest, marginBottom: spacing.sm },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
});
