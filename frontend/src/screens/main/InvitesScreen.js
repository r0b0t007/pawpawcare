import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useInvitesQuery } from '../../hooks/useInvites';
import { useTranslation } from '../../i18n';
import { ui, type, radii, photos } from '../../theme';
import { Card, Button, ConfirmDialog, showToast, FormScrollView, ScreenHeader, EmptyState } from '../../components';

// Invites are addressed by email, and signup never proves the address — so
// the server hides them until the account confirms it with an emailed code.
function VerifyEmailCard({ email, onVerified }) {
  const { t } = useTranslation();
  const { sendEmailVerification, confirmEmailVerification } = useAuth();
  const [step, setStep] = useState('intro'); // 'intro' | 'code'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await sendEmailVerification() === 'already_verified') {
        // Confirmed elsewhere; the refreshed user hides this card.
        showToast(t('invites.verify.alreadyConfirmed'));
        setBusy(false);
        await onVerified();
        return;
      }
      setStep('code');
      showToast(t('invites.verify.codeSent'));
    } catch (e) {
      setError(e?.message || t('invites.verify.sendFailed'));
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (code.trim().length !== 6) {
      setError(t('invites.verify.badCode'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmEmailVerification(code.trim());
      showToast(t('invites.verify.confirmed'));
      await onVerified();
    } catch (e) {
      setError(e?.message || t('invites.verify.codeFailed'));
      setBusy(false);
    }
  };

  return (
    <Card style={styles.verifyCard}>
      <View style={styles.verifyIcon}>
        <MaterialCommunityIcons name="email-check-outline" size={34} color={ui.accent} />
      </View>
      <Text style={styles.verifyTitle}>{t('invites.verify.title')}</Text>
      <Text style={styles.verifySub}>
        {step === 'intro'
          ? t('invites.verify.intro', { email })
          : t('invites.verify.codeSentBody', { email })}
      </Text>

      {step === 'code' && (
        <TextInput
          style={[styles.codeInput, focused && styles.codeInputFocused]}
          placeholder="000000"
          placeholderTextColor={ui.placeholder}
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '')); if (error) setError(null); }}
          keyboardType="number-pad"
          maxLength={6}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
        />
      )}

      {error ? <Text style={styles.errorText} selectable>{error}</Text> : null}

      <Button
        pill
        label={
          step === 'intro'
            ? busy ? t('invites.verify.sending') : t('invites.verify.send')
            : busy ? t('invites.verify.confirming') : t('invites.verify.confirm')
        }
        disabled={busy}
        onPress={step === 'intro' ? send : confirm}
        style={styles.verifyBtn}
      />
      {step === 'code' && (
        <Pressable accessibilityRole="button" onPress={send} disabled={busy} style={styles.resendLink}>
          <Text style={styles.resendLinkText}>{t('invites.verify.resend')}</Text>
        </Pressable>
      )}
    </Card>
  );
}

// "<b>Sam</b> invited you to co-own <b>Bella</b>": the names are user data,
// so they're spliced in as bold Text nodes, never parsed out of the string.
const INVITER = '\u0001';
const PET = '\u0002';
function invitedYou(t, inv) {
  const names = { [INVITER]: inv.inviterName, [PET]: inv.petName };
  return t('invites.invitedYou', { inviter: INVITER, pet: PET })
    .split(/([\u0001\u0002])/)
    .filter(Boolean)
    .map((part, i) => (part in names
      ? <Text key={i} style={styles.bold}>{names[part]}</Text>
      : part));
}

const TYPE_ICON = {
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
};

export default function InvitesScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { acceptInvite, declineInvite } = useData();
  const {
    data: invites = [], isLoading, isError, refetch,
  } = useInvitesQuery();
  // Explicit false only: an older API without the flag never hides the list.
  // Social accounts without a provider email (no-reply placeholder) have no
  // inbox to confirm — and no invite can be addressed to them anyway.
  const needsVerification = user?.email_verified === false
    && !String(user?.email || '').toLowerCase().endsWith('@users.noreply.pawpawcare.app');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [pendingDecline, setPendingDecline] = useState(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Resolves true when the server took it (acceptInvite/declineInvite never throw).
  const respond = async (id, action) => {
    setBusyId(id);
    const ok = action === 'accept' ? await acceptInvite(id) : await declineInvite(id);
    setBusyId(null);
    return ok;
  };

  const onAccept = async (inv) => {
    if (await respond(inv.id, 'accept')) showToast(t('invites.accepted', { pet: inv.petName }));
    else showToast(t('invites.acceptFailed', { pet: inv.petName }));
  };

  const confirmDecline = async () => {
    const inv = pendingDecline;
    setPendingDecline(null);
    if (!inv) return;
    if (await respond(inv.id, 'decline')) showToast(t('invites.declined'));
    else showToast(t('invites.declineFailed'));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('invites.title')} onBack={() => navigation.goBack()} />

      <FormScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {needsVerification ? (
          <VerifyEmailCard email={user.email} onVerified={() => refetch()} />
        ) : invites.length === 0 && isLoading ? null : invites.length === 0 && isError ? (
          <View style={styles.loadFailed}>
            <Text style={styles.loadFailedText}>{t('invites.loadFailed')}</Text>
            <Button variant="ghost" label={t('invites.retry')} onPress={() => refetch()} />
          </View>
        ) : invites.length === 0 ? (
          <EmptyState
            compact
            style={styles.emptyState}
            photo={photos.emptyKitten}
            title={t('invites.emptyTitle')}
            body={t('invites.emptyBody')}
          />
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
                    {invitedYou(t, inv)}
                  </Text>
                  {!!inv.inviterEmail && <Text style={styles.inviteSub}>{inv.inviterEmail}</Text>}
                </View>
              </View>
              <View style={styles.inviteActions}>
                <Button
                  pill
                  label={t('invites.accept')}
                  icon="check"
                  disabled={busyId === inv.id}
                  onPress={() => onAccept(inv)}
                  style={{ flex: 1 }}
                />
                <Button
                  pill
                  variant="ghost"
                  label={t('invites.decline')}
                  disabled={busyId === inv.id}
                  onPress={() => setPendingDecline(inv)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))
        )}
      </FormScrollView>

      <ConfirmDialog
        visible={!!pendingDecline}
        title={t('invites.declineTitle')}
        message={pendingDecline ? t('invites.declineMessage', { inviter: pendingDecline.inviterName }) : ''}
        confirmLabel={t('invites.decline')}
        destructive
        onConfirm={confirmDecline}
        onCancel={() => setPendingDecline(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadFailed: { alignItems: 'center', gap: 8, paddingVertical: 36, paddingHorizontal: 24 },
  loadFailedText: { ...type.secondary, color: ui.sub, textAlign: 'center' },
  emptyState: { paddingTop: 40 }, // breathing room under the header
  safe: { flex: 1, backgroundColor: ui.background },
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
  verifyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  verifyTitle: { ...type.cardTitle, color: ui.ink },
  verifySub: { ...type.body, color: ui.sub, textAlign: 'center', paddingHorizontal: 24 },
  verifyCard: { padding: 20, gap: 12, alignItems: 'center', marginTop: 24 },
  codeInput: {
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    letterSpacing: 6,
    textAlign: 'center',
    color: ui.ink,
  },
  // Focus = darker AND thicker (accent vs the tan outline is only 1.9:1).
  codeInputFocused: { borderColor: ui.accent, borderWidth: 2 },
  errorText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: ui.danger,
    textAlign: 'center',
  },
  verifyBtn: { alignSelf: 'stretch' },
  resendLink: { alignItems: 'center', paddingVertical: 6 },
  resendLinkText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: ui.accent,
  },
});
