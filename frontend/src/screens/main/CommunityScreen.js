import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Alert, Image, Keyboard,
  ActivityIndicator, Linking, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { uploadImage } from '../../services/api';
import { track } from '../../services/analytics';
import { useInFlight } from '../../hooks/useInFlight';
import { useGroupsQuery } from '../../hooks/useGroups';
import { useFeedQuery } from '../../hooks/useFeed';
import { useLostPetsBoardQuery } from '../../hooks/useLostPets';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { resolveAsset } from '../../config';
import { ui, type, PET_COLOR_PAIRS, motion, photos, pairFor } from '../../theme';
import {
  Card, Button, ConfirmDialog, EmptyState, SegmentedControl, showToast, FormScrollView,
} from '../../components';
import LostPetCard from './LostPetCard';
import PostCard from './PostCard';
import { useLocale, useTranslation } from '../../i18n';

// One screen, three peer sections (Feed / Lost pets / Groups) on a segmented
// control. A lost pet from someone else always tops the feed — the
// serial-position slot where attention is highest — as a warm, one-tap card.
// The composer starts collapsed; lost-pet reporting lives on the pushed
// LostPets screen — the section here only shows the board.


const GROUP_ICONS = ['dog', 'cat', 'bird', 'rabbit', 'paw'];

const SECTIONS = ['feed', 'lost', 'groups'];

export default function CommunityScreen({ navigation }) {
  // Re-render dates and times when the app language changes: this screen
  // can stay mounted under another tab while the language is switched.
  useLocale();
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    togglePaw, addPost, toggleGroupMembership,
    getComments, addComment, deleteComment, resolveLostPet,
    reportPost, unreportPost,
  } = useData();
  // Member counts move with other people's joins; a stale list refetches when
  // Community is focused again.
  const {
    data: groups = [], isLoading: groupsLoading, isError: groupsFailed, isStale: groupsStale,
    refetch: refetchGroups,
  } = useGroupsQuery();
  useRefetchOnFocus(refetchGroups, { isStale: groupsStale });
  // New posts from everyone else: a stale feed refetches on focus.
  const {
    data: posts = [], isLoading: feedLoading, isError: feedFailed, isStale: feedStale,
    refetch: refetchFeed,
  } = useFeedQuery();
  useRefetchOnFocus(refetchFeed, { isStale: feedStale });
  const {
    data: lostPets = [], isLoading: lostLoading, isError: lostFailed, isStale: boardStale,
    refetch: refetchBoard,
  } = useLostPetsBoardQuery();

  const [section, setSection] = useState('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftImage, setDraftImage] = useState(null);
  const [attaching, setAttaching] = useState(false);
  // Last failed image attach — { uri } keeps the picked file so "tap to retry"
  // re-uploads it without re-picking (uri is null if the pick itself is gone).
  const [attachFailed, setAttachFailed] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, destructive, action }

  // The feed leads with a lost pet, so it needs a fresh board too. This tab
  // stays mounted: refresh whenever Community is focused or the section
  // changes — always for Lost pets, and for the feed once the board is stale
  // (BOARD_STALE_MS, so no extra GET on every Feed tap). The query fetches
  // on mount by itself.
  const boardStaleRef = useRef(boardStale);
  boardStaleRef.current = boardStale;
  const boardMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const mounting = !boardMounted.current;
      boardMounted.current = true;
      if (section === 'lost' || (section === 'feed' && !mounting && boardStaleRef.current)) refetchBoard();
    }, [section, refetchBoard]),
  );

  const attachImage = async () => {
    setAttaching(true);
    const res = await pickAndUploadImage({ aspect: [4, 3] });
    setAttaching(false);
    if (res.url) { setDraftImage(res.url); setAttachFailed(null); }
    else if (res.error === 'permission') Alert.alert(t('community.permissionTitle'), t('community.permissionBody'));
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

  // One post per tap; the composer clears only once the post is saved.
  const { run, isBusy } = useInFlight();
  const handlePost = () => {
    if (!draft.trim()) return undefined;
    // The tap no longer closes the keyboard (FormScrollView), and it would
    // hide the toast below if the post fails.
    Keyboard.dismiss();
    return run('post', async () => {
      if (!(await addPost(draft.trim(), draftImage))) {
        showToast(t('community.postFailed'));
        return;
      }
      setDraft('');
      setDraftImage(null);
      setAttachFailed(null);
      setComposerOpen(false);
      showToast(t('community.posted'));
    });
  };

  const closeComposer = () => {
    setDraft('');
    setDraftImage(null);
    setAttachFailed(null);
    setComposerOpen(false);
  };

  const handleToggleGroup = (group) =>
    run(`group-${group.id}`, async () => {
      if (await toggleGroupMembership(group.id)) {
        showToast(t(group.isJoined ? 'community.groupLeft' : 'community.groupJoined', { name: group.name }));
      } else {
        showToast(t(group.isJoined ? 'community.leaveFailed' : 'community.joinFailed', { name: group.name }));
      }
    });

  const handleMarkFound = (report) => setConfirm({
    title: t('lostPets.markFound.title'),
    message: t('lostPets.markFound.message', { name: report.petName }),
    confirmLabel: t('lostPets.markFound.confirm'),
    action: async () => {
      if (await resolveLostPet(report.id)) showToast(t('lostPets.markFound.success'), { celebrate: true, actionType: 'lost_pet_found' });
      else showToast(t('lostPets.markFound.failed'));
    },
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
      <FormScrollView
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.title}>{t('community.title')}</Text>

        <SegmentedControl
          segments={SECTIONS.map((value) => ({ value, label: t(`community.sections.${value}`) }))}
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
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.moreLost, pressed && { opacity: motion.pressOpacity }]}
                  >
                    <Text style={styles.moreLostText}>
                      {t('community.seeAllLost', { count: othersLost.length })}
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
                accessibilityRole="button"
                accessibilityLabel={t('community.shareMoment')}
              >
                <View style={[styles.composerAvatar, { backgroundColor: userPair.bg }]}>
                  <Text style={[styles.composerAvatarText, { color: userPair.fg }]}>{(user?.name || 'U')[0]}</Text>
                </View>
                <Text style={styles.composerPlaceholder}>{t('community.shareMomentPlaceholder')}</Text>
                <MaterialCommunityIcons name="camera-outline" size={19} color={ui.accent} />
              </Pressable>
            ) : (
              <Card style={styles.composerCard}>
                <TextInput
                  style={styles.composerInput}
                  placeholder={t('community.composerPlaceholder')}
                  placeholderTextColor={ui.placeholder}
                  accessibilityLabel={t('community.newPost')}
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
                      accessibilityRole="button"
                      accessibilityLabel={t('community.removePhoto')}
                    >
                      <MaterialCommunityIcons name="close" size={15} color="#ffffff" />
                    </Pressable>
                  </View>
                )}
                {attachFailed && !attaching && (
                  <Pressable onPress={retryAttach} hitSlop={6} style={styles.attachFailedRow} accessibilityRole="button">
                    <MaterialCommunityIcons name="alert-circle-outline" size={15} color={ui.dangerText} />
                    <Text style={styles.attachFailedText}>{t('community.attachFailed')}</Text>
                  </Pressable>
                )}
                <View style={styles.composerActions}>
                  <Pressable
                    onPress={attachImage}
                    disabled={attaching}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('community.addPhoto')}
                    accessibilityState={{ busy: attaching }}
                  >
                    {attaching
                      ? <ActivityIndicator size="small" color={ui.accent} />
                      : <MaterialCommunityIcons name="image-plus" size={20} color={ui.accent} />}
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={closeComposer} hitSlop={8} style={styles.cancelBtn} accessibilityRole="button">
                    <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Button pill label={t('community.post')} onPress={handlePost} disabled={!draft.trim() || isBusy('post')} />
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
              {posts.length === 0 && feedLoading && (
                <ActivityIndicator color={ui.accent} style={styles.feedLoading} accessibilityLabel={t('common.loading')} />
              )}
              {posts.length === 0 && feedFailed && (
                <EmptyState
                  compact
                  title={t('community.feedLoadFailed')}
                  actionLabel={t('common.retry')}
                  actionIcon="refresh"
                  onAction={() => refetchFeed()}
                  style={styles.emptyState}
                />
              )}
              {posts.length === 0 && !feedLoading && !feedFailed && (
                <EmptyState
                  photo={photos.communityPals}
                  title={t('community.emptyFeedTitle')}
                  body={t('community.emptyFeedBody')}
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
                    <Text style={styles.groupName} numberOfLines={2}>{group.name}</Text>
                    <Text style={styles.groupMembers}>{t('community.members', { count: group.members })}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleToggleGroup(group)}
                    accessibilityRole="button"
                    // Starts with the visible word, so voice control's
                    // "tap Joined" matches; the hint says what a tap does.
                    accessibilityLabel={t(joined ? 'community.joinedA11y' : 'community.joinA11y', { name: group.name })}
                    accessibilityHint={t(joined ? 'community.leaveHint' : 'community.joinHint')}
                    style={({ pressed }) => [
                      styles.joinBtn,
                      joined && styles.joinBtnJoined,
                      pressed && { opacity: motion.pressOpacitySoft },
                    ]}
                  >
                    <Text style={[styles.joinBtnText, joined && styles.joinBtnTextJoined]}>
                      {t(joined ? 'community.joined' : 'community.join')}
                    </Text>
                  </Pressable>
                </Card>
              );
            })}
            {groups.length === 0 && groupsFailed && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="cloud-off-outline" size={32} color={ui.faint} />
                <Text style={styles.emptyText}>{t('community.groupsLoadFailed')}</Text>
                <Button variant="ghost" label={t('community.groupsRetry')} onPress={() => refetchGroups()} />
              </View>
            )}
            {groups.length === 0 && !groupsLoading && !groupsFailed && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="account-group-outline" size={32} color={ui.faint} />
                <Text style={styles.emptyTitle}>{t('community.emptyGroupsTitle')}</Text>
                <Text style={styles.emptyText}>{t('community.emptyGroupsBody')}</Text>
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
            {lostPets.length === 0 && lostFailed && (
              <EmptyState
                compact
                title={t('lostPets.loadFailed')}
                actionLabel={t('common.retry')}
                actionIcon="refresh"
                onAction={() => refetchBoard()}
                style={styles.emptyState}
              />
            )}
            {lostPets.length === 0 && !lostLoading && !lostFailed && (
              <EmptyState
                compact
                photo={photos.communityPals}
                title={t('lostPets.emptyTitle')}
                body={t('lostPets.emptyBody')}
                style={styles.emptyState}
              />
            )}
            <Pressable
              style={({ pressed }) => [styles.reportBtn, pressed && { backgroundColor: ui.pressTint }]}
              onPress={() => navigation.navigate('LostPets')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="bullhorn-outline" size={19} color={ui.accent} />
              <Text style={styles.reportBtnText}>{t('community.reportMissing')}</Text>
            </Pressable>
          </View>
        )}
      </FormScrollView>

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
  feedLoading: { paddingVertical: 36 },

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
    borderColor: ui.inputBorder,
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
