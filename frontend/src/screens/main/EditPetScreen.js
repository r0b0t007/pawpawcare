import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { resolveAsset } from '../../config';
import { useTranslation } from '../../i18n';
import { breedLabel, breedValue, isPetOwner } from '../../utils/pets';
import { ui, radii, type, PET_COLOR_PAIRS } from '../../theme';
import { Button, ConfirmDialog, showToast, ScreenHeader, FormScrollView } from '../../components';

// Edit pet: name, type, breed, identity color and photo. Deleting the pet
// lives here — behind a danger zone + ConfirmDialog — never on the browse path.
// Only the owner can delete (the API answers co-owners with 403), so a
// co-owner gets "Leave this pet" there instead (CHW-229).

// Labels come from i18n (`pets.types.*`); the ids are what gets stored.
const PET_TYPES = [
  { id: 'dog', icon: 'dog' },
  { id: 'cat', icon: 'cat' },
  { id: 'bird', icon: 'bird' },
  { id: 'rabbit', icon: 'rabbit' },
  { id: 'other', icon: 'paw' },
];

// i18n key for a theme color pair's name ('Sky blue' -> 'skyBlue').
const colorKey = (name) => name.replace(/ (\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());

// Stands in for the pet name in the preview sentence (see previewBefore).
const NAME_MARK = '\u0000';

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

export default function EditPetScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { petId } = route.params;
  const { pets, updatePet, deletePet, leavePet } = useData();
  const { user } = useAuth();
  const pet = pets.find((p) => p.id === petId);
  const isOwner = isPetOwner(pet, user);

  const [form, setForm] = useState({
    name: pet?.name || '',
    type: pet?.type || 'dog',
    // A suggested breed shows in the app language; breedValue stores it back in English.
    breed: breedLabel(pet?.breed),
    color: pet?.color || PET_COLOR_PAIRS[0].bg,
    avatarUrl: pet?.avatarUrl || null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDanger, setConfirmDanger] = useState(false);
  // Local uri of a picked photo whose upload failed — keep showing the chosen
  // image (never saved as avatarUrl) so the user can just tap again to retry.
  const [localPreview, setLocalPreview] = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[type.body, { color: ui.sub }]}>{t('editPet.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickAvatar = async () => {
    setUploading(true);
    const res = await pickAndUploadImage({ aspect: [1, 1] });
    setUploading(false);
    if (res.url) { set('avatarUrl', res.url); setLocalPreview(null); }
    else if (res.error === 'permission') showToast(t('editPet.photoPermission'));
    else if (res.error) {
      if (res.uri) setLocalPreview(res.uri);
      showToast(t('editPet.uploadFailed'));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast(t('editPet.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePet(petId, {
        name: form.name.trim(),
        type: form.type,
        breed: breedValue(form.breed),
        color: form.color,
        avatarUrl: form.avatarUrl,
      });
      if (!saved) {
        showToast(t('editPet.saveFailed'));
        return;
      }
      showToast(t('editPet.saved'));
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  // The preview sentence wraps the (bold) pet name: split the translation
  // around a marker so each language keeps its own word order.
  const [previewBefore, previewAfter = ''] = t('editPet.preview', { name: NAME_MARK }).split(NAME_MARK);

  // The owner removes the pet; a co-owner can't (the API answers 403), so
  // their way out is leaving it, the same action as the profile's ••• menu.
  // Either way: navigate away first so the pet vanishing from state can't
  // flash a "Pet not found" frame; the request then completes in the
  // background (leavePet reports its own failure).
  const dangerAction = isOwner
    ? {
        hint: t('editPet.dangerHint', { name: pet.name }),
        icon: 'delete-outline',
        label: t('editPet.remove', { name: pet.name }),
        title: t('editPet.confirmTitle', { name: pet.name }),
        message: t('editPet.confirmMessage'),
        confirmLabel: t('editPet.confirmLabel'),
        run: () => {
          const name = pet.name;
          deletePet(petId).then((ok) =>
            showToast(ok ? t('editPet.removed', { name }) : t('editPet.removeFailed', { name })));
        },
      }
    : {
        hint: t('editPet.coOwnerHint', { name: pet.name }),
        icon: 'exit-to-app',
        label: t('petProfile.menu.leave'),
        title: t('petProfile.confirm.leaveTitle'),
        message: t('petProfile.confirm.leaveMessage', { name: pet.name }),
        confirmLabel: t('petProfile.confirm.leave'),
        run: () => leavePet(petId),
      };

  const handleDangerConfirm = () => {
    setConfirmDanger(false);
    navigation.popToTop();
    dangerAction.run();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <ScreenHeader title={t('editPet.title', { name: pet.name })} onBack={() => navigation.goBack()} flush style={{ paddingBottom: 20 }} />

        {/* Photo */}
        <View style={styles.avatarArea}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uploading ? t('editPet.uploadingA11y') : t('editPet.changePhotoA11y', { name: pet.name })}
            accessibilityState={{ busy: uploading }}
            onPress={pickAvatar}
            disabled={uploading}
            style={styles.avatarTap}
          >
            <View style={[styles.avatar, { backgroundColor: form.color }]}>
              {uploading ? (
                <ActivityIndicator color={petFg(form.color)} />
              ) : localPreview ? (
                <Image source={{ uri: localPreview }} style={styles.avatarImg} />
              ) : form.avatarUrl ? (
                <Image source={{ uri: resolveAsset(form.avatarUrl) }} style={styles.avatarImg} />
              ) : (
                <Text style={[styles.avatarInitial, { color: petFg(form.color) }]}>
                  {(form.name || pet.name)[0]}
                </Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <MaterialCommunityIcons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>{form.avatarUrl ? t('editPet.tapToChange') : t('editPet.tapToAdd')}</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('editPet.name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('editPet.namePlaceholder')}
            placeholderTextColor={ui.placeholder}
            value={form.name}
            onChangeText={(v) => set('name', v)}
          />
        </View>

        {/* Type */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('editPet.type')}</Text>
          <View style={styles.chipWrap}>
            {PET_TYPES.map((pt) => {
              const on = form.type === pt.id;
              return (
                <Pressable
                  key={pt.id}
                  style={[styles.typeChip, on && styles.typeChipOn]}
                  onPress={() => set('type', pt.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                >
                  <MaterialCommunityIcons name={pt.icon} size={16} color={on ? ui.background : ui.ink} />
                  <Text style={[styles.typeChipText, on && { color: ui.background }]}>{t(`pets.types.${pt.id}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Breed */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('editPet.breed')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('editPet.breedPlaceholder')}
            placeholderTextColor={ui.placeholder}
            value={form.breed}
            onChangeText={(v) => set('breed', v)}
          />
        </View>

        {/* Profile color */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('editPet.profileColor')}</Text>
          <View style={styles.swatchRow}>
            {PET_COLOR_PAIRS.map((c) => {
              const on = form.color === c.bg;
              return (
                <Pressable
                  key={c.bg}
                  style={[styles.swatchRing, on && { borderColor: ui.accent }]}
                  onPress={() => set('color', c.bg)}
                  accessibilityRole="radio"
                  accessibilityLabel={t('pets.colorA11y', { color: t(`pets.colors.${colorKey(c.name)}`, { defaultValue: c.name }) })}
                  accessibilityState={{ checked: on }}
                >
                  <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                    {on && <MaterialCommunityIcons name="check" size={18} color={c.fg} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Preview */}
        <View style={styles.previewCard}>
          <View style={[styles.previewAvatar, { backgroundColor: form.color }]}>
            {form.avatarUrl ? (
              <Image source={{ uri: resolveAsset(form.avatarUrl) }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.previewInitial, { color: petFg(form.color) }]}>
                {(form.name || pet.name)[0]}
              </Text>
            )}
          </View>
          <Text style={styles.previewText}>
            {previewBefore}<Text style={styles.previewName}>{form.name.trim() || pet.name}</Text>{previewAfter}
          </Text>
        </View>

        <Button
          label={saving ? t('editPet.saving') : t('editPet.saveChanges')}
          onPress={handleSave}
          disabled={saving || uploading}
        />

        {/* Danger zone: Remove for the owner, Leave for a co-owner. */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerLabel}>{t('editPet.dangerZone')}</Text>
          <Text style={styles.dangerHint}>{dangerAction.hint}</Text>
          <Pressable accessibilityRole="button"
            style={({ pressed }) => [styles.removeBtn, pressed && { backgroundColor: ui.dangerPressTint }]}
            onPress={() => setConfirmDanger(true)}
          >
            <MaterialCommunityIcons name={dangerAction.icon} size={17} color={ui.danger} />
            <Text style={styles.removeBtnText}>{dangerAction.label}</Text>
          </Pressable>
        </View>
      </FormScrollView>

      <ConfirmDialog
        visible={confirmDanger}
        title={dangerAction.title}
        message={dangerAction.message}
        confirmLabel={dangerAction.confirmLabel}
        destructive
        onConfirm={handleDangerConfirm}
        onCancel={() => setConfirmDanger(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  // The scroll already pads the sides and top.
  avatarArea: { alignItems: 'center', marginBottom: 20 },
  avatarTap: { position: 'relative' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 34 },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: ui.background,
  },
  avatarHint: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle, marginTop: 10 },
  field: { marginBottom: 20 },
  fieldLabel: { ...type.sectionLabel, color: ui.subtle, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    padding: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
  typeChipOn: { backgroundColor: ui.ink, borderColor: ui.ink },
  typeChipText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
  swatchRow: { flexDirection: 'row', gap: 12 },
  swatchRing: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 26,
    padding: 2,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 20,
  },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18 },
  previewText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
    color: ui.sub,
  },
  previewName: { fontFamily: 'PlusJakartaSans_700Bold', color: ui.ink },
  dangerZone: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#f1d7d4',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  dangerLabel: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ui.danger,
  },
  dangerHint: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12.5, lineHeight: 18, color: ui.sub },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: ui.surface,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
  },
  removeBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.danger },
});
