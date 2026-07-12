import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Switch, Modal, Image, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { resolveAsset } from '../../config';
import { ui, radii, type, PET_COLOR_PAIRS } from '../../theme';
import { Button, showToast } from '../../components';

const PET_TYPES = [
  { id: 'dog', label: 'Dog', icon: 'dog' },
  { id: 'cat', label: 'Cat', icon: 'cat' },
  { id: 'bird', label: 'Bird', icon: 'bird' },
  { id: 'rabbit', label: 'Rabbit', icon: 'rabbit' },
  { id: 'other', label: 'Other', icon: 'paw' },
];

const GENDERS = [
  { id: 'male', label: 'Male', icon: 'gender-male' },
  { id: 'female', label: 'Female', icon: 'gender-female' },
];

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

export default function AddPetScreen({ navigation, route }) {
  const { petId } = route.params || {};
  const { pets, addPet, updatePet } = useData();
  const existing = petId ? pets.find((p) => p.id === petId) : null;
  const isEdit = !!existing;

  const [form, setForm] = useState({
    name: existing?.name || '',
    type: existing?.type || 'dog',
    breed: existing?.breed || '',
    birthday: existing?.birthday || '',
    age: existing?.age?.toString() || '',
    weight: existing?.weight?.toString() || '',
    weightUnit: existing?.weightUnit || 'kg',
    gender: existing?.gender || 'male',
    microchipped: existing?.microchipped || false,
    color: existing?.color || PET_COLOR_PAIRS[0].bg,
    avatarUrl: existing?.avatarUrl || null,
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickAvatar = async () => {
    setUploading(true);
    const res = await pickAndUploadImage({ aspect: [1, 1] });
    setUploading(false);
    if (res.url) set('avatarUrl', res.url);
    else if (res.error === 'permission') showToast('Allow photo access to set a pet photo');
    else if (res.error) showToast('Could not upload that image — try again');
  };

  const birthdayDate = form.birthday ? new Date(form.birthday + 'T12:00:00') : new Date();

  const formatBirthday = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      const iso = selectedDate.toISOString().split('T')[0];
      set('birthday', iso);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Give your pet a name first');
      return;
    }
    const data = {
      name: form.name.trim(),
      type: form.type,
      breed: form.breed.trim(),
      birthday: form.birthday || null,
      age: parseInt(form.age) || 0,
      weight: form.weight,
      weightUnit: form.weightUnit,
      gender: form.gender,
      microchipped: form.microchipped,
      color: form.color,
      avatarUrl: form.avatarUrl,
    };
    if (isEdit) {
      await updatePet(petId, data);
      navigation.goBack();
    } else {
      const pet = await addPet(data);
      navigation.replace('PetProfile', { petId: pet.id });
    }
  };

  const selectedType = PET_TYPES.find((t) => t.id === form.type);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.topRow}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>{isEdit ? 'Edit Pet' : 'Add a Pet'}</Text>
          </View>

          {/* Photo */}
          <View style={styles.avatarArea}>
            <Pressable onPress={pickAvatar} disabled={uploading} style={styles.avatarTap}>
              <View style={[styles.avatar, { backgroundColor: form.color }]}>
                {uploading ? (
                  <ActivityIndicator color={petFg(form.color)} />
                ) : form.avatarUrl ? (
                  <Image source={{ uri: resolveAsset(form.avatarUrl) }} style={styles.avatarImg} />
                ) : (
                  <MaterialCommunityIcons name={selectedType?.icon || 'paw'} size={40} color={petFg(form.color)} />
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
              placeholderTextColor={ui.subtle}
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
              placeholderTextColor={ui.subtle}
              value={form.breed}
              onChangeText={(v) => set('breed', v)}
            />
          </View>

          {/* Age + birthday */}
          <View style={styles.row2}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Age (years)</Text>
              <TextInput
                style={styles.input}
                placeholder="2"
                placeholderTextColor={ui.subtle}
                value={form.age}
                onChangeText={(v) => set('age', v)}
                keyboardType="number-pad"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Birthday</Text>
              <Pressable
                style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: ui.surface }]}
                onPress={() => setShowDatePicker(true)}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={17} color={ui.accent} />
                <Text style={[styles.dateBtnText, !form.birthday && { color: ui.subtle }]} numberOfLines={1}>
                  {form.birthday ? formatBirthday(form.birthday) : 'Select date'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Weight + unit */}
          <View style={styles.row2}>
            <View style={[styles.field, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>Weight</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 28"
                placeholderTextColor={ui.subtle}
                value={form.weight}
                onChangeText={(v) => set('weight', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Unit</Text>
              <Pressable
                style={({ pressed }) => [styles.dateBtn, { justifyContent: 'center' }, pressed && { backgroundColor: ui.surface }]}
                onPress={() => set('weightUnit', form.weightUnit === 'kg' ? 'lbs' : 'kg')}
              >
                <Text style={styles.unitText}>{form.weightUnit}</Text>
                <MaterialCommunityIcons name="swap-horizontal" size={15} color={ui.accent} />
              </Pressable>
            </View>
          </View>

          {/* Gender */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => {
                const on = form.gender === g.id;
                return (
                  <Pressable
                    key={g.id}
                    style={[styles.genderChip, on && styles.typeChipOn]}
                    onPress={() => set('gender', g.id)}
                  >
                    <MaterialCommunityIcons name={g.icon} size={16} color={on ? ui.background : ui.ink} />
                    <Text style={[styles.typeChipText, on && { color: ui.background }]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
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
                  >
                    <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                      {on && <MaterialCommunityIcons name="check" size={18} color={c.fg} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Microchipped */}
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <View style={styles.switchIcon}>
                <MaterialCommunityIcons name="chip" size={18} color={ui.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Microchipped</Text>
                <Text style={styles.switchSub}>Is your pet microchipped?</Text>
              </View>
            </View>
            <Switch
              value={form.microchipped}
              onValueChange={(v) => set('microchipped', v)}
              trackColor={{ false: ui.track, true: ui.accentTint }}
              thumbColor={form.microchipped ? ui.accent : ui.faint}
            />
          </View>

          <Button
            label={isEdit ? 'Save changes' : 'Add pet'}
            icon={isEdit ? 'content-save-outline' : 'paw'}
            onPress={handleSave}
            disabled={uploading}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Android date picker */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={birthdayDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      {/* iOS date picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.iosPickerHeader}>
                <Pressable onPress={() => setShowDatePicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.iosPickerCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.iosPickerTitle}>Birthday</Text>
                <Pressable onPress={() => setShowDatePicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={birthdayDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={onDateChange}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
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
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    padding: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  row2: { flexDirection: 'row', gap: 12 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    padding: 14,
    minHeight: 49,
  },
  dateBtnText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: ui.ink,
  },
  unitText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
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
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  switchIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchLabel: { ...type.rowTitle, color: ui.ink },
  switchSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  iosPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36, 26, 14, 0.4)' },
  iosPickerSheet: {
    backgroundColor: ui.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: ui.faint,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairline,
  },
  iosPickerTitle: { ...type.cardTitleSm, color: ui.ink },
  iosPickerCancel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: ui.sub },
  iosPickerDone: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.accent },
});
