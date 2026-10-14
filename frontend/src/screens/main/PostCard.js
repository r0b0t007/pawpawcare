import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Image, Pressable, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { timeAgo } from '../../utils/dates';
import { useInFlight } from '../../hooks/useInFlight';
import { resolveAsset } from '../../config';
import { ui, type, motion, pairFor } from '../../theme';
import { Card, ConfirmDialog, showToast } from '../../components';

// One post in the Community feed: paws, comments (loaded on expand), report.
// Every control is icon + count, so each carries a label, role and state for
// screen readers rather than the icon glyph and a bare number.
export default function PostCard({ post, userId, onPaw, getComments, addComment, deleteComment, reportPost, unreportPost }) {
  const hasPawed = !!post.pawedByMe;
  const paws = post.paws ?? 0; // partial payloads (UPDATE_POST, optimistic adds) may lack it
  const pair = pairFor(post.authorName);
  const isOwn = post.authorId === userId;

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(null); // null = never loaded
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // comment pending deletion
  const [confirmReport, setConfirmReport] = useState(false);
  // One request per tap: paw is a toggle (a double tap would undo itself)
  // and a double-tapped comment would post twice.
  const { run, isBusy } = useInFlight();
  // Bumped by every load and every collapse: only the newest load may apply
  // its result, so an older one can't overwrite newer state when it lands.
  const loadSeq = useRef(0);
  const loadedOnce = useRef(false); // the server's thread has been shown at least once

  // Every hook is above: reporting flips `reportedByMe` on a mounted card,
  // and an early return before a hook crashes the render (fewer hooks).
  // Reported by me → the card collapses into a quiet hidden state with an
  // Undo. `reportedByMe` comes from the feed payload, so it survives
  // refreshes until the report is undone.
  if (post.reportedByMe) {
    return (
      <Card style={styles.hiddenCard}>
        <MaterialCommunityIcons name="flag-outline" size={18} color={ui.subtle} />
        <Text style={styles.hiddenText}>
          Post hidden — thanks for the report. Our team reviews within 24 hours.
        </Text>
        <Pressable
          onPress={() => unreportPost(post.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Undo report"
        >
          <Text style={styles.hiddenUndo}>Undo</Text>
        </Pressable>
      </Card>
    );
  }

  // Reload on every expand so comments from others appear; spinner only the
  // first time. A failed load keeps what was shown and says so, instead of
  // reading as an empty thread. `quiet` reloads follow our own writes (post,
  // delete): they replace any load still in flight, which could predate the
  // write, and a failure there just keeps the local list.
  const loadComments = async ({ quiet = false } = {}) => {
    const seq = ++loadSeq.current;
    if (!quiet) {
      if (comments === null) setLoading(true);
      setLoadFailed(false);
    }
    const result = await getComments(post.id);
    if (seq !== loadSeq.current) return; // a newer load or a collapse won
    setLoading(false);
    if (result) {
      loadedOnce.current = true;
      setComments(result);
      setLoadFailed(false);
    } else if (!quiet || !loadedOnce.current) {
      // A quiet reload only stays silent when the thread loaded before;
      // otherwise the list holds just our own comment and must say so.
      setLoadFailed(true);
      AccessibilityInfo.announceForAccessibility?.("Couldn't load comments");
    }
  };

  const toggleComments = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadComments();
    else loadSeq.current += 1;
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return undefined;
    return run('comment', async () => {
      setDraft('');
      const c = await addComment(post.id, text);
      if (c) {
        // Show it now; the quiet reload brings the full thread with it (a
        // first load still in flight would otherwise be dropped).
        setLoading(false);
        setLoadFailed(false);
        setComments((prev) => [...(prev || []), c]);
        loadComments({ quiet: true });
      } else {
        setDraft(text); // restore the typed comment if the request failed
      }
    });
  };

  const removeComment = async (id) => {
    if (!(await deleteComment(post.id, id))) {
      showToast("Couldn't delete the comment. Try again.");
      return;
    }
    setComments((prev) => (prev || []).filter((c) => c.id !== id));
    loadComments({ quiet: true }); // a reload from before the delete can't bring it back
    showToast('Comment deleted');
  };

  const commentCount = comments ? comments.length : post.comments;
  const sendDisabled = !draft.trim() || isBusy('comment');

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
          <Pressable
            onPress={() => setConfirmReport(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={post.authorName ? `Report ${post.authorName}'s post` : 'Report this post'}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={ui.subtle} />
          </Pressable>
        )}
      </View>
      <Text style={styles.postContent}>{post.content}</Text>
      {post.imageUrl ? (
        <Image source={{ uri: resolveAsset(post.imageUrl) }} style={styles.postImage} resizeMode="cover" />
      ) : null}
      <View style={styles.postActions}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => run('paw', async () => {
            if ((await onPaw()) === false) showToast("Couldn't update the paw. Try again.");
          })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${paws} ${paws === 1 ? 'paw' : 'paws'}`}
          accessibilityHint={hasPawed ? 'Takes back your paw' : 'Gives this post a paw'}
          accessibilityState={{ selected: hasPawed, busy: isBusy('paw') }}
        >
          <MaterialCommunityIcons
            name={hasPawed ? 'paw' : 'paw-outline'}
            size={19}
            color={hasPawed ? ui.accent : ui.sub}
          />
          <Text style={[styles.actionText, hasPawed && { color: ui.accent }]}>{paws}</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={toggleComments}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
          accessibilityHint={expanded ? 'Hides the comments' : 'Shows the comments'}
          accessibilityState={{ expanded }}
        >
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
          {loadFailed && (
            <Pressable
              onPress={() => loadComments()}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLiveRegion="polite"
              style={styles.loadFailedRow}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={15} color={ui.dangerText} />
              <Text style={styles.loadFailedText}>Couldn't load comments. Tap to retry.</Text>
            </Pressable>
          )}
          {loading && comments === null ? (
            <Text style={styles.commentEmpty} accessibilityLiveRegion="polite">Loading comments…</Text>
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
                    <Pressable
                      onPress={() => setConfirm(c)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      // A deleted author's name comes back empty.
                      accessibilityLabel={c.author_name ? `Delete ${c.author_name}'s comment` : 'Delete this comment'}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={ui.subtle} />
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
              placeholderTextColor={ui.placeholder}
              accessibilityLabel="Add a comment"
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            {/* Pressable reports `disabled` to screen readers itself. */}
            <Pressable
              style={[styles.commentSend, sendDisabled && { opacity: motion.disabledOpacity }]}
              onPress={submit}
              disabled={sendDisabled}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              <MaterialCommunityIcons name="send" size={15} color={ui.onAccent} />
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
  loadFailedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadFailedText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.dangerText },
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
});
