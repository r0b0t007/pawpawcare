import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, post, del } from '../../services/api';
import { resolveAsset } from '../../config';
import { ui, type, radii } from '../../theme';
import { Card, Button, ConfirmDialog, showToast } from '../../components';

// Admin-only review queue (Profile → Moderation). Lists every community post
// with open reports — including ones auto-hidden from the feed at 3+ reports —
// and offers exactly two outcomes: dismiss the reports (post restored for
// everyone) or remove the post (destructive, behind ConfirmDialog). Reporter
// identities never reach the client; the API only sends counts.

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ModerationScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState(null); // post id with an in-flight action
  const [confirmRemove, setConfirmRemove] = useState(null); // post id pending confirm
  const nextPageRef = useRef(2); // the next page loadMore should request

  // Fetch page 1 and replace the list (initial load + pull-to-refresh).
  const load = useCallback(async () => {
    try {
      const data = await get('/admin/reports');
      setItems(Array.isArray(data?.items) ? data.items : []);
      setHasMore(!!data?.has_more);
      nextPageRef.current = 2;
    } catch (e) {
      showToast(e?.message || 'Could not load reports — try again');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Append the next page. Dedupe by post id so overlaps from the list shifting
  // under offset pagination (a dismiss/remove between pages) never show twice.
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await get(`/admin/reports?page=${nextPageRef.current}`);
      const more = Array.isArray(data?.items) ? data.items : [];
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.post.id));
        return [...prev, ...more.filter((it) => !seen.has(it.post.id))];
      });
      setHasMore(!!data?.has_more);
      nextPageRef.current += 1;
    } catch (e) {
      showToast(e?.message || 'Could not load more — try again');
    } finally {
      setLoadingMore(false);
    }
  };

  const removeFromList = (postId) =>
    setItems((prev) => prev.filter((it) => it.post.id !== postId));

  const handleDismiss = async (postId) => {
    setBusyId(postId);
    try {
      await post(`/admin/posts/${postId}/dismiss-reports`);
      removeFromList(postId);
      showToast('Reports dismissed — post restored');
    } catch (e) {
      showToast(e?.message || 'Could not dismiss — try again');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (postId) => {
    setConfirmRemove(null);
    setBusyId(postId);
    try {
      await del(`/admin/posts/${postId}`);
      removeFromList(postId);
      showToast('Post removed');
    } catch (e) {
      showToast(e?.message || 'Could not remove — try again');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />
        }
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Moderation</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={ui.accent} style={styles.spinner} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="shield-check" size={30} color={ui.success} />
            </View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptySub}>No open reports right now.</Text>
          </View>
        ) : (
          <>
            {items.map(({ post: p, report_count: count, hidden }) => (
            <Card key={p.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.author} numberOfLines={1}>
                  {p.author_name || 'Unknown'}
                </Text>
                <Text style={styles.time}>{timeAgo(p.created_at)}</Text>
              </View>

              <Text style={styles.content} numberOfLines={4}>
                {p.content}
              </Text>

              {p.image_url ? (
                <Image source={{ uri: resolveAsset(p.image_url) }} style={styles.image} />
              ) : null}

              <View style={styles.pillRow}>
                <View style={[styles.pill, hidden ? styles.pillDanger : styles.pillWarn]}>
                  <Text style={[styles.pillText, { color: hidden ? ui.dangerText : ui.warnText }]}>
                    {hidden
                      ? `${count} reports · hidden from feed`
                      : `${count} report${count === 1 ? '' : 's'}`}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Button
                  small
                  variant="ghost"
                  label="Dismiss reports"
                  onPress={() => handleDismiss(p.id)}
                  disabled={busyId === p.id}
                  style={{ flex: 1 }}
                />
                <Button
                  small
                  variant="danger"
                  label="Remove post"
                  onPress={() => setConfirmRemove(p.id)}
                  disabled={busyId === p.id}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
            ))}
            {hasMore ? (
              <View style={styles.loadMore}>
                <Button
                  small
                  variant="ghost"
                  label={loadingMore ? 'Loading…' : 'Load more'}
                  onPress={loadMore}
                  disabled={loadingMore}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirmRemove}
        title="Remove this post?"
        message="It disappears for everyone. This can't be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={() => handleRemove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 26,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    letterSpacing: -0.3,
    color: ui.ink,
  },
  spinner: { marginTop: 64 },
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 40 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ui.successTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: ui.ink },
  emptySub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: ui.sub,
    marginTop: 4,
    textAlign: 'center',
  },
  itemCard: { marginHorizontal: 24, marginBottom: 14, padding: 16, gap: 10 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  author: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink, flexShrink: 1 },
  time: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle },
  content: { ...type.body, color: ui.ink },
  image: {
    width: '100%',
    height: 160,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    backgroundColor: ui.hairline,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillWarn: { backgroundColor: ui.warnTint },
  pillDanger: { backgroundColor: ui.dangerTint },
  pillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  loadMore: { alignItems: 'center', marginTop: 4, marginBottom: 8 },
});
