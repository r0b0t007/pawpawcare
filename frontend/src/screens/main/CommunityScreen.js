import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert, Image,
  ActivityIndicator, Linking, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { uploadImage } from '../../services/api';
import { track } from '../../services/analytics';
import { timeAgo } from '../../utils/dates';
import { resolveAsset } from '../../config';
import { ui, type, PET_COLOR_PAIRS, motion, photos } from '../../theme';
import {
  Card, Button, ConfirmDialog, EmptyState, SegmentedControl, showToast,
} from '../../components';
import LostPetCard from './LostPetCard';

// One screen, three peer sections (Feed / Lost pets / Groups) on a segmented
// control. A lost pet from someone else always tops the feed — the
// serial-position slot where attention is highest — as a warm, one-tap card.
// The composer starts collapsed; lost-pet reporting lives on the pushed
// LostPets screen — the section here only shows the board.

// Identity colors only — never UI chrome.
const pairFor = (name) => PET_COLOR_PAIRS[name ? name.charCodeAt(0) % PET_COLOR_PAIRS.length : 0];

const GROUP_ICONS = ['dog', 'cat', 'bird', 'rabbit', 'paw'];

const SECTIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'lost', label: 'Lost pets' },
  { value: 'groups', label: 'Groups' },
];

export default function CommunityScreen({ navigation }) {
  const { user } = useAuth();
  const {
    posts, groups, togglePaw, addPost, toggleGroupMembership, lostPets,
    getComments, addComment, deleteComment, refreshLostPets, resolveLostPet,
    reportPost, unreportPost,
  } = useData();

  const [section, setSection] = useState('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftImage, setDraftImage] = useState(null);
  const [attaching, setAttaching] = useState(false);
  // Last failed image attach — { uri } keeps the picked file so "tap to retry"
  // re-uploads it without re-picking (uri is null if the pick itself is gone).
  const [attachFailed, setAttachFailed] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, destructive, action }

  // The feed leads with a nearby lost pet, so it needs the board too.
  // The feed leads with a nearby lost pet, so it needs the board once per
  // visit; the Lost pets section refreshes it every time it's opened.
  const boardLoaded = useRef(false);
  useEffect(() => {
    if (section === 'lost' || (section === 'feed' && !boardLoaded.current)) {
      boardLoaded.current = true;
      refreshLostPets();
    }
  }, [section]);

  const attachImage = async () => {
    setAttaching(true);
    const res = await pickAndUploadImage({ aspect: [4, 3] });
    setAttaching(false);
    if (res.url) { setDraftImage(res.url); setAttachFailed(null); }
    else if (res.error === 'permission') Alert.alert('Permission needed', 'Allow photo access to attach a picture.');
    else if (res.error) {
      // The draft is untouched; show the failure inline instead of an alert
      // and keep the picked file for a one-tap retry.
      setAttachFailed({ uri: res.uri || null });
      track('post_image_upload_failed');
    }
  };

  const retryAttach = async () => {
    track('post_image_upload_retried');
    if (!attachFailed?.uri) {
      // The picked file wasn't retained — reopen the picker instead.
      setAttachFailed(null);
      attachImage();
      return;
    }
    setAttaching(true);
    try {
      const url = await uploadImage(attachFailed.uri);
      setDraftImage(url);
      setAttachFailed(null);
    } catch {
      track('post_image_upload_failed'); // still failing — keep the retry row
    } finally {
      setAttaching(false);
    }
  };

  const handlePost = async () => {
    if (!draft.trim()) return;
    await addPost(draft.trim(), draftImage);
    setDraft('');
    setDraftImage(null);
    setAttachFailed(null);
    setComposerOpen(false);
    showToast('Shared with the pack');
  };

  const closeComposer = () => {
    setDraft('');
    setDraftImage(null);
    setAttachFailed(null);
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
    action: async () => { await resolveLostPet(report.id); showToast('Welcome home!', { celebrate: true, actionType: 'lost_pet_found' }); },
  });

  // "I've seen them" only exists when the owner shared a number — never a
  // dead primary button (LostPetCard hides it when onSeen is omitted).
  const seenHandler = (report) =>
    report.contactPhone
      ? () => Linking.openURL(`tel:${report.contactPhone}`).catch(() => {})
      : undefined;

  const userPair = pairFor(user?.name);
  // Someone else's active report, newest first — the feed's top card.
  const othersLost = lostPets.filter((r) => r.reportedBy !== user?.id && r.status !== 'resolved');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Community</Text>

        <SegmentedControl
          segments={SECTIONS}
          value={section}
          onChange={setSection}
          style={styles.segmented}
        />

        {/* ── Feed ── */}
        {section === 'feed' && (
          <View>
            {othersLost.length > 0 && (
              <View style={styles.feedLost}>
                <LostPetCard
                  elevated
                  report={othersLost[0]}
                  onSeen={seenHandler(othersLost[0])}
                />
                {othersLost.length > 1 && (
                  <Pressable
                    onPress={() => setSection('lost')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.moreLost, pressed && { opacity: motion.pressOpacity }]}
                  >
                    <Text style={styles.moreLostText}>
                      See all {othersLost.length} lost pets
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={ui.accent} />
                  </Pressable>
                )}
              </View>
            )}

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
                {attachFailed && !attaching && (
                  <Pressable onPress={retryAttach} hitSlop={6} style={styles.attachFailedRow}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={15} color={ui.dangerText} />
                    <Text style={styles.attachFailedText}>Image upload failed — tap to retry</Text>
                  </Pressable>
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
                  reportPost={reportPost}
                  unreportPost={unreportPost}
                />
              ))}
              {posts.length === 0 && (
                <EmptyState
                  photo={photos.communityPals}
                  title="No posts yet"
                  body="Be the first to share a moment with your pet!"
                  style={styles.emptyState}
                />
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
                      pressed && { opacity: motion.pressOpacitySoft },
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
                <LostPetCard
                  key={report.id}
                  report={report}
                  mine={mine}
                  onSeen={seenHandler(report)}
                  onFound={() => handleMarkFound(report)}
                />
              );
            })}
            {lostPets.length === 0 && (
              <EmptyState
                compact
                photo={photos.communityPals}
                title="No pets reported lost"
                body="Good news — every pet in the community is home safe."
                style={styles.emptyState}
              />
            )}
            <Pressable
              style={({ pressed }) => [styles.reportBtn, pressed && { backgroundColor: ui.pressTint }]}
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

function PostCard({ post, userId, onPaw, getComments, addComment, deleteComment, reportPost, unreportPost }) {
  const hasPawed = !!post.pawedByMe;
  const pair = pairFor(post.authorName);
  const isOwn = post.authorId === userId;

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(null); // null = never loaded
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // comment pending deletion
  const [confirmReport, setConfirmReport] = useState(false);

  // Reported by me → the whole card collapses into a quiet hidden state with
  // an Undo. `reportedByMe` comes from the feed payload, so it survives
  // refreshes until the report is undone.
  if (post.reportedByMe) {
    return (
      <Card style={styles.hiddenCard}>
        <MaterialCommunityIcons name="flag-outline" size={18} color={ui.subtle} />
        <Text style={styles.hiddenText}>
          Post hidden — thanks for the report. Our team reviews within 24 hours.
        </Text>
        <Pressable onPress={() => unreportPost(post.id)} hitSlop={8}>
          <Text style={styles.hiddenUndo}>Undo</Text>
        </Pressable>
      </Card>
    );
  }

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
        {!isOwn && (
          <Pressable onPress={() => setConfirmReport(true)} hitSlop={8}>
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={ui.subtle} />
          </Pressable>
        )}
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

      <ConfirmDialog
        visible={confirmReport}
        title="Report this post?"
        message="It's hidden for you right away, and our team reviews every report within 24 hours."
        confirmLabel="Report"
        destructive
        onCancel={() => setConfirmReport(false)}
        onConfirm={() => { setConfirmReport(false); reportPost(post.id); }}
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
  segmented: { marginHorizontal: 24, marginBottom: 18 },
  feedLost: { marginHorizontal: 24, marginBottom: 18, gap: 10 },
  moreLost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 44,
  },
  moreLostText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
  emptyState: { paddingVertical: 20 },

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
  attachFailedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attachFailedText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.dangerText },
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
  postCard: { padding: 16 },
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
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    borderCurve: 'continuous',
    marginBottom: 14,
    backgroundColor: ui.track,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ui.hairline,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44 },
  actionText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.sub },

  // Reported → hidden collapsed state
  hiddenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hiddenText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12.5,
    lineHeight: 18,
    color: ui.sub,
  },
  hiddenUndo: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },

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
