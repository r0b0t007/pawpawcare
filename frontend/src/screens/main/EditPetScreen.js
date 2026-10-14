import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { resolveAsset } from '../../config';
import { ui, radii, type, PET_COLOR_PAIRS } from '../../theme';
import { Button, ConfirmDialog, showToast, ScreenHeader, FormScrollView } from '../../components';

// Edit pet: name, type, breed, identity color and photo. Deleting the pet
// lives here — behind a danger zone + ConfirmDialog — never on the browse path.

const PET_TYPES = [
  { id: 'dog', label: 'Dog', icon: 'dog' },
  { id: 'cat', label: 'Cat', icon: 'cat' },
  { id: 'bird', label: 'Bird', icon: 'bird' },
  { id: 'rabbit', label: 'Rabbit', icon: 'rabbit' },
  { id: 'other', label: 'Other', icon: 'paw' },
];

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

export default function EditPetScreen({ navigation, route }) {
  const { petId } = route.params;
  const { pets, updatePet, deletePet } = useData();
  const pet = pets.find((p) => p.id === petId);

  const [form, setForm] = useState({
    name: pet?.name || '',
    type: pet?.type || 'dog',
    breed: pet?.breed || '',
    color: pet?.color || PET_COLOR_PAIRS[0].bg,
    avatarUrl: pet?.avatarUrl || null,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Local uri of a picked photo whose upload failed — keep showing the chosen
  // image (never saved as avatarUrl) so the user can just tap again to retry.
  const [localPreview, setLocalPreview] = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[type.body, { color: ui.sub }]}>Pet not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickAvatar = async () => {
    setUploading(true);
    const res = await pickAndUploadImage({ aspect: [1, 1] });
    setUploading(false);
    if (res.url) { set('avatarUrl', res.url); setLocalPreview(null); }
    else if (res.error === 'permission') showToast('Allow photo access to set a pet photo');
    else if (res.error) {
      if (res.uri) setLocalPreview(res.uri);
      showToast('Could not upload that image — try again');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Give your pet a name first');
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePet(petId, {
        name: form.name.trim(),
        type: form.type,
        breed: form.breed.trim(),
        color: form.color,
        avatarUrl: form.avatarUrl,
      });
      if (!saved) {
        showToast("Couldn't save the changes. Try again.");
        return;
      }
      showToast('Saved');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    setConfirmRemove(false);
    // Navigate away first so the pet vanishing from state can't flash a
    // "Pet not found" frame; the delete then completes in the background.
    navigation.popToTop();
    const name = pet.name;
    deletePet(petId).then((ok) =>
      showToast(ok ? `${name} removed` : `Couldn't remove ${name}. Try again.`));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <ScreenHeader title={`Edit ${pet.name}`} onBack={() => navigation.goBack()} style={styles.header} />

        {/* Photo */}
        <View style={styles.avatarArea}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uploading ? 'Uploading photo' : `Change ${pet.name}'s photo`}
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
          <Text style={styles.avatarHint}>{form.avatarUrl ? 'Tap to change photo' : 'Tap to add a photo'}</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Luna"
            placeholderTextColor={ui.placeholder}
            value={form.name}
            onChangeText={(v) => set('name', v)}
          />
        </View>

        {/* Type */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.chipWrap}>
            {PET_TYPES.map((t) => {
              const on = form.type === t.id;
              return (
                <Pressable
                  key={t.id}
                  style={[styles.typeChip, on && styles.typeChipOn]}
                  onPress={() => set('type', t.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                >
                  <MaterialCommunityIcons name={t.icon} size={16} color={on ? ui.background : ui.ink} />
                  <Text style={[styles.typeChipText, on && { color: ui.background }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Breed */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Breed (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Golden Retriever"
            placeholderTextColor={ui.placeholder}
            value={form.breed}
            onChangeText={(v) => set('breed', v)}
          />
        </View>

        {/* Profile color */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Profile color</Text>
          <View style={styles.swatchRow}>
            {PET_COLOR_PAIRS.map((c) => {
              const on = form.color === c.bg;
              return (
                <Pressable
                  key={c.bg}
                  style={[styles.swatchRing, on && { borderColor: ui.accent }]}
                  onPress={() => set('color', c.bg)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${c.name} profile color`}
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
            This is how <Text style={styles.previewName}>{form.name.trim() || pet.name}</Text> will appear across the app.
          </Text>
        </View>

        <Button
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={handleSave}
          disabled={saving || uploading}
        />

        {/* Danger zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerLabel}>Danger zone</Text>
          <Text style={styles.dangerHint}>
            Removing {pet.name} deletes their records for everyone they're shared with.
          </Text>
          <Pressable accessibilityRole="button"
            style={({ pressed }) => [styles.removeBtn, pressed && { backgroundColor: ui.dangerPressTint }]}
            onPress={() => setConfirmRemove(true)}
          >
            <MaterialCommunityIcons name="delete-outline" size={17} color={ui.danger} />
            <Text style={styles.removeBtnText}>Remove {pet.name}</Text>
          </Pressable>
        </View>
      </FormScrollView>

      <ConfirmDialog
        visible={confirmRemove}
        title={`Remove ${pet.name}?`}
        message="This deletes all records permanently. This can't be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  // The scroll already pads the sides and top.
  header: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, marginBottom: 20 },
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
