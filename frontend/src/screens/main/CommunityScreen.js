import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert, Image,
  ActivityIndicator, Linking, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { resolveAsset } from '../../config';
import { ui, type, PET_COLOR_PAIRS } from '../../theme';
import { Card, Chip, Button, ConfirmDialog, showToast } from '../../components';

// Redesign: one screen, three chip-switched sections (Feed / Groups / Lost
// pets). The composer starts collapsed; lost-pet reporting lives on the
// pushed LostPets screen — the section here only shows the board.

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function missingFor(iso) {
  if (!iso) return 'Missing';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'Missing today';
  return `Missing ${days} day${days === 1 ? '' : 's'}`;
}

// Identity colors only — never UI chrome.
const pairFor = (name) => PET_COLOR_PAIRS[name ? name.charCodeAt(0) % PET_COLOR_PAIRS.length : 0];

const GROUP_ICONS = ['dog', 'cat', 'bird', 'rabbit', 'paw'];

const SECTIONS = [
  { key: 'feed', label: 'Feed' },
  { key: 'groups', label: 'Groups' },
  { key: 'lost', label: 'Lost pets' },
];

export default function CommunityScreen({ navigation }) {
  const { user } = useAuth();
  const {
    posts, groups, togglePaw, addPost, toggleGroupMembership, lostPets,
    getComments, addComment, deleteComment, refreshLostPets, resolveLostPet,
  } = useData();

  const [section, setSection] = useState('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftImage, setDraftImage] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, destructive, action }

  useEffect(() => {
    if (section === 'lost') refreshLostPets();
  }, [section]);

  const attachImage = async () => {
    setAttaching(true);
    const res = await pickAndUploadImage({ aspect: [4, 3] });
    setAttaching(false);
    if (res.url) setDraftImage(res.url);
    else if (res.error === 'permission') Alert.alert('Permission needed', 'Allow photo access to attach a picture.');
    else if (res.error) Alert.alert('Upload failed', 'Could not upload that image. Please try again.');
  };

  const handlePost = async () => {
    if (!draft.trim()) return;
    await addPost(draft.trim(), draftImage);
    setDraft('');
    setDraftImage(null);
    setComposerOpen(false);
    showToast('Shared with the pack');
  };

  const closeComposer = () => {
    setDraft('');
    setDraftImage(null);
    setComposerOpen(false);
  };

  const handleToggleGroup = (group) => {
    toggleGroupMembership(group.id);
    showToast(group.isJoined ? `Left ${group.name}` : `Joined ${group.name}`);
  };

  const handleMarkFound = (report) => setConfirm({
    title: 'Mark as found?',
    message: `Has ${report.petName} been found safe?`,
    confirmLabel: 'Found!',
    action: async () => { await resolveLostPet(report.id); showToast('Welcome home!'); },
  });

  const handleSeen = (report) => {
    if (report.contactPhone) {
      Linking.openURL(`tel:${report.contactPhone}`).catch(() => {});
    } else {
      showToast('No contact number was shared');
    }
  };

  const userPair = pairFor(user?.name);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Community</Text>

        {/* Section chips */}
        <View style={styles.chipRow}>
          {SECTIONS.map((s) => (
            <Chip key={s.key} label={s.label} active={section === s.key} onPress={() => setSection(s.key)} />
          ))}
        </View>

        {/* ── Feed ── */}
        {section === 'feed' && (
          <View>
            {!composerOpen ? (
              <Pressable
                style={({ pressed }) => [styles.composerCollapsed, pressed && { borderColor: ui.faint }]}
                onPress={() => setComposerOpen(true)}
              >
                <View style={[styles.composerAvatar, { backgroundColor: userPair.bg }]}>
                  <Text style={[styles.composerAvatarText, { color: userPair.fg }]}>{(user?.name || 'U')[0]}</Text>
                </View>
                <Text style={styles.composerPlaceholder}>Share a moment…</Text>
                <MaterialCommunityIcons name="camera-outline" size={19} color={ui.accent} />
              </Pressable>
            ) : (
              <Card style={styles.composerCard}>
                <TextInput
                  style={styles.composerInput}
                  placeholder="What's your pack up to?"
                  placeholderTextColor={ui.subtle}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  autoFocus
                />
                {draftImage && (
                  <View style={styles.draftPreview}>
                    <Image source={{ uri: resolveAsset(draftImage) }} style={styles.draftPreviewImg} />
                    <Pressable
                      style={styles.draftRemove}
                      onPress={() => setDraftImage(null)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="close" size={15} color="#ffffff" />
                    </Pressable>
                  </View>
                )}
                <View style={styles.composerActions}>
                  <Pressable onPress={attachImage} disabled={attaching} hitSlop={8}>
                    {attaching
                      ? <ActivityIndicator size="small" color={ui.accent} />
                      : <MaterialCommunityIcons name="image-plus" size={20} color={ui.accent} />}
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={closeComposer} hitSlop={8} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Button pill label="Post" onPress={handlePost} disabled={!draft.trim()} />
                </View>
              </Card>
            )}

            <View style={styles.feedList}>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  userId={user?.id}
                  onPaw={() => togglePaw(post.id)}
                  getComments={getComments}
                  addComment={addComment}
                  deleteComment={deleteComment}
                />
              ))}
              {posts.length === 0 && (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="forum-outline" size={32} color={ui.faint} />
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptyText}>Be the first to share a moment with your pet!</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Groups ── */}
        {section === 'groups' && (
          <View style={styles.groupList}>
            {groups.map((group, idx) => {
              const pair = PET_COLOR_PAIRS[idx % PET_COLOR_PAIRS.length];
              const joined = group.isJoined;
              return (
                <Card key={group.id} style={styles.groupRow}>
                  <View style={[styles.groupIcon, { backgroundColor: pair.bg }]}>
                    <MaterialCommunityIcons name={GROUP_ICONS[idx % GROUP_ICONS.length]} size={24} color={pair.fg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                    <Text style={styles.groupMembers}>{group.members} members</Text>
                  </View>
                  <Pressable
                    onPress={() => handleToggleGroup(group)}
                    style={({ pressed }) => [
                      styles.joinBtn,
                      joined && styles.joinBtnJoined,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.joinBtnText, joined && styles.joinBtnTextJoined]}>
                      {joined ? 'Joined' : 'Join'}
                    </Text>
                  </Pressable>
                </Card>
              );
            })}
            {groups.length === 0 && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="account-group-outline" size={32} color={ui.faint} />
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptyText}>Groups will appear here as the community grows.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Lost pets ── */}
        {section === 'lost' && (
          <View style={styles.lostList}>
            {lostPets.map((report) => {
              const mine = report.reportedBy === user?.id;
              return (
                <Card key={report.id}>
                  {report.photoUrl ? (
                    <Image source={{ uri: resolveAsset(report.photoUrl) }} style={styles.lostPhoto} resizeMode="cover" />
                  ) : null}
                  <View style={styles.lostBody}>
                    <View style={styles.lostTitleRow}>
                      <Text style={styles.lostTitle} numberOfLines={1}>
                        {report.petName}
                        {report.petType ? ` — ${report.petType}` : ''}
                      </Text>
                      <Text style={styles.lostMissing}>{missingFor(report.createdAt)}</Text>
                    </View>
                    {report.description ? <Text style={styles.lostDesc}>{report.description}</Text> : null}
                    {report.lastSeenLocation ? (
                      <View style={styles.lostLocation}>
                        <MaterialCommunityIcons name="map-marker-outline" size={15} color={ui.subtle} />
                        <Text style={styles.lostLocationText}>Last seen near {report.lastSeenLocation}</Text>
                      </View>
                    ) : null}
                    {mine ? (
                      <Pressable
                        onPress={() => handleMarkFound(report)}
                        style={({ pressed }) => [styles.foundBtn, pressed && { opacity: 0.85 }]}
                      >
                        <Text style={styles.foundBtnText}>Mark as found</Text>
                      </Pressable>
                    ) : (
                      <Button label="I've seen them" onPress={() => handleSeen(report)} />
                    )}
                  </View>
                </Card>
              );
            })}
            {lostPets.length === 0 && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="heart-outline" size={32} color={ui.faint} />
                <Text style={styles.emptyTitle}>No pets reported lost</Text>
                <Text style={styles.emptyText}>Good news — every pet in the community is home safe.</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.reportBtn, pressed && { backgroundColor: '#fffdf8' }]}
              onPress={() => navigation.navigate('LostPets')}
            >
              <MaterialCommunityIcons name="bullhorn-outline" size={19} color={ui.accent} />
              <Text style={styles.reportBtnText}>Report a missing pet</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const a = confirm?.action; setConfirm(null); a?.(); }}
      />
    </SafeAreaView>
  );
}

function PostCard({ post, userId, onPaw, getComments, addComment, deleteComment }) {
  const hasPawed = !!post.pawedByMe;
  const pair = pairFor(post.authorName);

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(null); // null = never loaded
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // comment pending deletion

  const toggleComments = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      // Reload on every expand so comments from others appear; spinner only first time.
      if (comments === null) setLoading(true);
      setComments(await getComments(post.id));
      setLoading(false);
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const c = await addComment(post.id, text);
    if (c) {
      setComments((prev) => [...(prev || []), c]);
    } else {
      setDraft(text); // restore the typed comment if the request failed
    }
  };

  const removeComment = async (id) => {
    await deleteComment(post.id, id);
    setComments((prev) => (prev || []).filter((c) => c.id !== id));
    showToast('Comment deleted');
  };

  const commentCount = comments ? comments.length : post.comments;

  return (
    <Card style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: pair.bg }]}>
          <Text style={[styles.postAvatarText, { color: pair.fg }]}>{(post.authorName || '?')[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      {post.imageUrl ? (
        <Image source={{ uri: resolveAsset(post.imageUrl) }} style={styles.postImage} resizeMode="cover" />
      ) : null}
      <View style={styles.postActions}>
        <Pressable style={styles.actionBtn} onPress={onPaw} hitSlop={6}>
          <MaterialCommunityIcons
            name={hasPawed ? 'paw' : 'paw-outline'}
            size={19}
            color={hasPawed ? ui.accent : ui.sub}
          />
          <Text style={[styles.actionText, hasPawed && { color: ui.accent }]}>{post.paws}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={toggleComments} hitSlop={6}>
          <MaterialCommunityIcons
            name={expanded ? 'chat' : 'chat-outline'}
            size={19}
            color={expanded ? ui.accent : ui.sub}
          />
          <Text style={[styles.actionText, expanded && { color: ui.accent }]}>{commentCount}</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.commentsWrap}>
          {loading && comments === null ? (
            <Text style={styles.commentEmpty}>Loading…</Text>
          ) : comments && comments.length === 0 ? (
            <Text style={styles.commentEmpty}>No comments yet — say something nice!</Text>
          ) : (
            (comments || []).map((c) => {
              const cPair = pairFor(c.author_name);
              const canDelete = c.author_id === userId || post.authorId === userId;
              return (
                <View key={c.id} style={styles.commentRow}>
                  <View style={[styles.commentAvatar, { backgroundColor: cPair.bg }]}>
                    <Text style={[styles.commentAvatarText, { color: cPair.fg }]}>{(c.author_name || '?')[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>
                      {c.author_name} <Text style={styles.commentTime}>· {timeAgo(c.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                  {canDelete && (
                    <Pressable onPress={() => setConfirm(c)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <MaterialCommunityIcons name="close" size={14} color={ui.faint} />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={ui.subtle}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable
              style={[styles.commentSend, !draft.trim() && { opacity: 0.4 }]}
              onPress={submit}
              disabled={!draft.trim()}
            >
              <MaterialCommunityIcons name="send" size={15} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      )}

      <ConfirmDialog
        visible={!!confirm}
        title="Delete comment?"
        message="This comment will be removed for everyone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); if (c) removeComment(c.id); }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 28 },
  title: {
    ...type.screenTitle,
    color: ui.ink,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
  },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingBottom: 20 },

  // Composer
  composerCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 18,
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
  },
  composerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13 },
  composerPlaceholder: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: ui.subtle },
  composerCard: { marginHorizontal: 24, marginBottom: 18, padding: 16, gap: 12 },
  composerInput: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: ui.ink,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancelBtn: { paddingVertical: 9, paddingHorizontal: 16 },
  cancelText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.sub },
  draftPreview: { borderRadius: 14, overflow: 'hidden' },
  draftPreviewImg: { width: '100%', height: 160 },
  draftRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(36, 26, 14, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Feed
  feedList: { marginHorizontal: 24, gap: 14 },
  postCard: { padding: 18 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },
  postAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  postAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16 },
  postAuthor: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
  postTime: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11.5, color: ui.subtle },
  postContent: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: ui.ink,
    marginBottom: 14,
  },
  postImage: { width: '100%', height: 200, borderRadius: 14, marginBottom: 14, backgroundColor: ui.track },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ui.hairline,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.sub },

  // Comments
  commentsWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ui.hairline,
    gap: 12,
  },
  commentEmpty: { ...type.secondary, color: ui.subtle },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  commentAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11 },
  commentAuthor: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: ui.ink },
  commentTime: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: ui.subtle },
  commentText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: ui.ink,
    marginTop: 1,
  },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  commentInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    color: ui.ink,
    maxHeight: 90,
  },
  commentSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Groups
  groupList: { marginHorizontal: 24, gap: 14 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  groupIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.ink },
  groupMembers: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.sub, marginTop: 1 },
  joinBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
  joinBtnJoined: { backgroundColor: ui.accentTint, borderColor: ui.accentTint },
  joinBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12.5, color: ui.ink },
  joinBtnTextJoined: { color: ui.accent },

  // Lost pets
  lostList: { marginHorizontal: 24, gap: 14 },
  lostPhoto: { width: '100%', height: 130, backgroundColor: ui.track },
  lostBody: { padding: 18, gap: 12 },
  lostTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  lostTitle: { flex: 1, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: ui.ink },
  lostMissing: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.danger },
  lostDesc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 19, color: ui.sub },
  lostLocation: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lostLocationText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: ui.subtle },
  foundBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ui.successTint,
  },
  foundBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.success },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ui.faint,
    borderRadius: 20,
    padding: 16,
  },
  reportBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },

  // Empty states
  empty: { alignItems: 'center', gap: 6, paddingVertical: 36, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.ink, marginTop: 6 },
  emptyText: { ...type.secondary, color: ui.sub, textAlign: 'center' },
});
