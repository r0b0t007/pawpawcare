import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { ui, type } from '../../theme';
import { Card, Button, ConfirmDialog, showToast } from '../../components';

const TYPE_ICON = {
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
};

export default function InvitesScreen({ navigation }) {
  const { invites, refreshInvites, acceptInvite, declineInvite } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pendingDecline, setPendingDecline] = useState(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshInvites();
    setRefreshing(false);
  }, [refreshInvites]);

  const respond = async (id, action) => {
    setBusyId(id);
    if (action === 'accept') await acceptInvite(id);
    else await declineInvite(id);
    setBusyId(null);
  };

  const onAccept = async (inv) => {
    await respond(inv.id, 'accept');
    showToast(`You're now caring for ${inv.petName}`);
  };

  const confirmDecline = async () => {
    const inv = pendingDecline;
    setPendingDecline(null);
    if (!inv) return;
    await respond(inv.id, 'decline');
    showToast('Invitation declined');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Invitations</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {invites.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="email-heart-outline" size={34} color={ui.accent} />
            </View>
            <Text style={styles.emptyTitle}>No pending invitations</Text>
            <Text style={styles.emptySub}>When someone shares a pet with you, the invite will appear here.</Text>
          </View>
        ) : (
          invites.map((inv) => (
            <Card key={inv.id} style={styles.inviteCard}>
              <View style={styles.inviteBody}>
                <View style={styles.petIcon}>
                  <MaterialCommunityIcons
                    name={TYPE_ICON[inv.petType] || 'paw'}
                    size={22}
                    color={ui.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteText} numberOfLines={2}>
                    <Text style={styles.bold}>{inv.inviterName}</Text> invited you to co-own{' '}
                    <Text style={styles.bold}>{inv.petName}</Text>
                  </Text>
                  {!!inv.inviterEmail && <Text style={styles.inviteSub}>{inv.inviterEmail}</Text>}
                </View>
              </View>
              <View style={styles.inviteActions}>
                <Button
                  pill
                  label="Accept"
                  icon="check"
                  disabled={busyId === inv.id}
                  onPress={() => onAccept(inv)}
                  style={{ flex: 1 }}
                />
                <Button
                  pill
                  variant="ghost"
                  label="Decline"
                  disabled={busyId === inv.id}
                  onPress={() => setPendingDecline(inv)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDecline}
        title="Decline invitation?"
        message={pendingDecline ? `${pendingDecline.inviterName} will need to invite you again if you change your mind.` : ''}
        confirmLabel="Decline"
        destructive
        onConfirm={confirmDecline}
        onCancel={() => setPendingDecline(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
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
  title: { ...type.screenTitle, flex: 1, color: ui.ink },
  scroll: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  inviteCard: { padding: 16, gap: 14 },
  inviteBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  petIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteText: { ...type.body, color: ui.sub },
  bold: { fontFamily: 'PlusJakartaSans_700Bold', color: ui.ink },
  inviteSub: { ...type.secondary, color: ui.subtle, marginTop: 2 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  empty: { alignItems: 'center', paddingTop: 56, gap: 10 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: { ...type.cardTitle, color: ui.ink },
  emptySub: { ...type.body, color: ui.sub, textAlign: 'center', paddingHorizontal: 24 },
});
