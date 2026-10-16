import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { ui, type, radii, motion } from '../../theme';
import { Button, ConfirmDialog, showToast, FormScrollView, ScreenHeader } from '../../components';
import { isRenewingStoreSubscription, storeName } from '../../utils/subscription';

// Account details (Profile → Edit). PATCH /users/me only accepts name / bio /
// avatar_url / timezone, so name is the one editable field here; email is
// rendered read-only. The prototype's "Change password" row is omitted — the
// backend has no password-change endpoint yet.

export default function AccountDetailsScreen({ navigation }) {
  const { t } = useTranslation();
  const { user, updateUser, deleteAccount } = useAuth();
  // Deleting the account doesn't stop store billing — say so before it happens.
  const renewingSubscription = isRenewingStoreSubscription(user?.plan);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const saved = await updateUser({ name: trimmed });
    setSaving(false);
    if (!saved) {
      showToast(t('account.saveFailed'));
      return; // stay, with the typed name, so it can be retried
    }
    showToast(t('account.saved'));
    navigation.goBack();
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteAccount();
      // Success logs the user out — AppNavigator flips to the landing screen,
      // so no toast would be visible here.
    } catch (_) {
      setDeleting(false);
      showToast(t('account.deleteFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t('account.title')} onBack={() => navigation.goBack()} flush />

        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || t('account.avatarFallback'))[0].toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('account.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('account.namePlaceholder')}
              placeholderTextColor={ui.placeholder}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
            />
          </View>

          <View>
            <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('account.emailLabel')}</Text>
            <View style={[styles.input, styles.inputReadOnly]}>
              <Text style={styles.readOnlyValue}>{user?.email}</Text>
              <MaterialCommunityIcons name="lock-outline" size={16} color={ui.faint} />
            </View>
            <Text style={styles.readOnlyHint}>{t('account.emailHint')}</Text>
          </View>

          <Button label={t('account.save')} onPress={handleSave} disabled={!canSave} />
        </View>

        <View style={styles.dangerZone}>
          <Text style={[type.sectionLabel, styles.dangerLabel]}>{t('account.dangerZone')}</Text>
          <Pressable
            style={({ pressed }) => [styles.dangerRow, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => setConfirmDelete(true)}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel={t('account.delete')}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={19} color={ui.danger} />
            <Text style={styles.dangerRowText}>
              {deleting ? t('account.deleting') : t('account.delete')}
            </Text>
          </Pressable>
          <Text style={styles.dangerHint}>
            {t('account.deleteHint')}
          </Text>
        </View>
      </FormScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('account.confirmTitle')}
        message={
          t('account.confirmMessage') +
          (renewingSubscription
            ? ` ${t('account.confirmBilling', { store: storeName(user.plan.store) })}`
            : '')
        }
        confirmLabel={t('account.delete')}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingHorizontal: 24, paddingBottom: 32 },
  avatarWrap: { alignItems: 'center', marginBottom: 26 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 34, color: ui.accent },
  form: { gap: 20 },
  fieldLabel: { color: ui.subtle, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  inputReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readOnlyValue: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.sub,
  },
  readOnlyHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: ui.subtle,
    marginTop: 7,
  },
  dangerZone: { marginTop: 36 },
  dangerLabel: { color: ui.subtle, marginBottom: 10 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: ui.dangerTint,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  dangerRowText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: ui.danger,
  },
  dangerHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: ui.subtle,
    marginTop: 8,
  },
});
