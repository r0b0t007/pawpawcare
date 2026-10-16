import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { get, post, del } from '../../services/api';
import { resolveAsset } from '../../config';
import { ui, type, radii, photos } from '../../theme';
import { Card, Button, ConfirmDialog, showToast, ScreenHeader, EmptyState } from '../../components';
import i18n, { useTranslation } from '../../i18n';

// Admin-only review queue (Profile → Moderation). Lists every community post
// with open reports — including ones auto-hidden from the feed at 3+ reports —
// and offers exactly two outcomes: dismiss the reports (post restored for
// everyone) or remove the post (destructive, behind ConfirmDialog). Reporter
// identities never reach the client; the API only sends counts.

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return i18n.t('moderation.minutesAgo', { count: Math.max(1, Math.floor(diff / 60)) });
  if (diff < 86400) return i18n.t('moderation.hoursAgo', { count: Math.floor(diff / 3600) });
  return i18n.t('moderation.daysAgo', { count: Math.floor(diff / 86400) });
}

export default function ModerationScreen({ navigation }) {
  const { t } = useTranslation();
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
      showToast(e?.message || i18n.t('moderation.loadFailed'));
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
      showToast(e?.message || t('moderation.loadMoreFailed'));
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
      showToast(t('moderation.dismissed'));
    } catch (e) {
      showToast(e?.message || t('moderation.dismissFailed'));
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
      showToast(t('moderation.removed'));
    } catch (e) {
      showToast(e?.message || t('moderation.removeFailed'));
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
        <ScreenHeader title={t('moderation.title')} onBack={() => navigation.goBack()} />

        {loading ? (
          <ActivityIndicator size="large" color={ui.accent} style={styles.spinner} />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            style={styles.emptyState}
            photo={photos.communityPals}
            title={t('moderation.emptyTitle')}
            body={t('moderation.emptyBody')}
          />
        ) : (
          <>
            {items.map(({ post: p, report_count: count, hidden }) => (
            <Card key={p.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.author} numberOfLines={1}>
                  {p.author_name || t('moderation.unknownAuthor')}
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
                    {t(hidden ? 'moderation.reportsHidden' : 'moderation.reports', { count })}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Button
                  small
                  variant="ghost"
                  label={t('moderation.dismiss')}
                  onPress={() => handleDismiss(p.id)}
                  disabled={busyId === p.id}
                  style={{ flex: 1 }}
                />
                <Button
                  small
                  variant="danger"
                  label={t('moderation.remove')}
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
                  label={loadingMore ? t('common.loading') : t('common.loadMore')}
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
        title={t('moderation.removeTitle')}
        message={t('moderation.removeMessage')}
        confirmLabel={t('moderation.removeConfirm')}
        destructive
        onConfirm={() => handleRemove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyState: { paddingTop: 40 }, // breathing room under the header
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 }, // ScreenHeader pads the top
  spinner: { marginTop: 64 },
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
