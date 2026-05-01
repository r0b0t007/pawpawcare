import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, Switch, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii } from '../../theme';

const PET_TYPES = [
  { id: 'dog', label: 'Dog', icon: 'dog' },
  { id: 'cat', label: 'Cat', icon: 'cat' },
  { id: 'bird', label: 'Bird', icon: 'bird' },
  { id: 'rabbit', label: 'Rabbit', icon: 'rabbit' },
  { id: 'other', label: 'Other', icon: 'paw' },
];

const GENDERS = ['male', 'female'];

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
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const [showDatePicker, setShowDatePicker] = useState(false);

  const birthdayDate = form.birthday ? new Date(form.birthday + 'T12:00:00') : new Date();

  const formatBirthday = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
      Alert.alert('Missing Name', 'Please enter a name for your pet.');
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
    };
    if (isEdit) {
      await updatePet(petId, data);
      navigation.goBack();
    } else {
      const pet = await addPet(data);
      navigation.replace('PetProfile', { petId: pet.id });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.pageTitle}>{isEdit ? 'Edit Pet' : 'Add a Pet'}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Pet avatar preview */}
          <View style={styles.avatarArea}>
            <View style={[styles.bigAvatar, { backgroundColor: existing?.color || colors.primaryFixed }]}>
              <MaterialCommunityIcons
                name={PET_TYPES.find((t) => t.id === form.type)?.icon || 'paw'}
                size={52}
                color={colors.primaryContainer}
              />
            </View>
            <Text style={styles.avatarHint}>Pet avatar is auto-generated</Text>
          </View>

          {/* Pet type */}
          <Label text="Pet Type" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow} contentContainerStyle={{ paddingHorizontal: spacing.margin, gap: spacing.sm }}>
            {PET_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeChip, form.type === t.id && styles.typeChipActive]}
                onPress={() => set('type', t.id)}
              >
                <MaterialCommunityIcons name={t.icon} size={20} color={form.type === t.id ? colors.onPrimary : colors.onSurfaceVariant} />
                <Text style={[styles.typeLabel, form.type === t.id && styles.typeLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.form}>
            <Field label="Name *">
              <TextInput style={styles.input} placeholder="e.g. Luna" placeholderTextColor={colors.onSurfaceVariant} value={form.name} onChangeText={(v) => set('name', v)} />
            </Field>
            <Field label="Breed">
              <TextInput style={styles.input} placeholder="e.g. Golden Retriever" placeholderTextColor={colors.onSurfaceVariant} value={form.breed} onChangeText={(v) => set('breed', v)} />
            </Field>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Field label="Age (years)">
                  <TextInput style={styles.input} placeholder="2" placeholderTextColor={colors.onSurfaceVariant} value={form.age} onChangeText={(v) => set('age', v)} keyboardType="number-pad" />
                </Field>
              </View>
                      <View style={{ flex: 1 }}>
                <Field label="Birthday">
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <MaterialCommunityIcons name="calendar" size={18} color={colors.primaryContainer} />
                    <Text style={[styles.dateBtnText, !form.birthday && styles.datePlaceholder]}>
                      {form.birthday ? formatBirthday(form.birthday) : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </Field>
              </View>
            </View>
            <View style={styles.row2}>
              <View style={{ flex: 2 }}>
                <Field label="Weight">
                  <TextInput style={styles.input} placeholder="e.g. 28" placeholderTextColor={colors.onSurfaceVariant} value={form.weight} onChangeText={(v) => set('weight', v)} keyboardType="decimal-pad" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Unit">
                  <TouchableOpacity style={styles.unitToggle} onPress={() => set('weightUnit', form.weightUnit === 'kg' ? 'lbs' : 'kg')}>
                    <Text style={styles.unitText}>{form.weightUnit}</Text>
                    <MaterialCommunityIcons name="swap-horizontal" size={16} color={colors.primaryContainer} />
                  </TouchableOpacity>
                </Field>
              </View>
            </View>

            {/* Gender */}
            <Label text="Gender" />
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderChip, form.gender === g && styles.genderChipActive]}
                  onPress={() => set('gender', g)}
                >
                  <MaterialCommunityIcons
                    name={g === 'female' ? 'gender-female' : 'gender-male'}
                    size={18}
                    color={form.gender === g ? colors.onPrimary : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.typeLabel, form.gender === g && styles.typeLabelActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Microchipped */}
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Microchipped</Text>
                <Text style={styles.switchSub}>Is your pet microchipped?</Text>
              </View>
              <Switch
                value={form.microchipped}
                onValueChange={(v) => set('microchipped', v)}
                trackColor={{ false: colors.surfaceContainerHigh, true: colors.primaryFixed }}
                thumbColor={form.microchipped ? colors.primaryContainer : colors.outline}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <MaterialCommunityIcons name="content-save" size={18} color={colors.onPrimary} />
              <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Add Pet'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker — Android: native dialog, iOS: modal with spinner */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={birthdayDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerSheet}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.iosPickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.iosPickerTitle}>Birthday</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </TouchableOpacity>
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

function Label({ text }) {
  return <Text style={[styles.fieldLabel, { paddingHorizontal: spacing.margin, marginBottom: 6, marginTop: spacing.sm }]}>{text}</Text>;
}

function Field({ label, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  back: {
    width: 40, height: 40, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, justifyContent: 'center', alignItems: 'center',
  },
  pageTitle: { ...typography.titleLg, color: colors.onBackground },
  avatarArea: { alignItems: 'center', paddingVertical: spacing.md },
  bigAvatar: { width: 96, height: 96, borderRadius: radii.xl, justifyContent: 'center', alignItems: 'center' },
  avatarHint: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  typeRow: { marginBottom: spacing.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.lg, backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  typeLabelActive: { color: colors.onPrimary },
  form: { paddingHorizontal: spacing.margin, gap: spacing.md },
  fieldLabel: { ...typography.labelMd, color: colors.onSurface },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.DEFAULT, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.outlineVariant,
    ...typography.bodyMd, color: colors.onSurface, minHeight: 52,
  },
  row2: { flexDirection: 'row', gap: spacing.sm },
  unitToggle: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant, minHeight: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
  },
  unitText: { ...typography.labelMd, color: colors.primaryContainer },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  genderChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surfaceContainerLowest, padding: spacing.md, borderRadius: radii.xl,
    borderWidth: 1, borderColor: colors.surfaceContainerLow,
  },
  switchLabel: { ...typography.labelMd, color: colors.onSurface },
  switchSub: { ...typography.labelSm, color: colors.onSurfaceVariant },
  saveBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.lg,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.base,
    marginTop: spacing.sm,
    shadowColor: colors.primaryContainer, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 5,
  },
  saveBtnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 16 },
  dateBtn: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.DEFAULT, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.outlineVariant,
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  dateBtnText: { ...typography.bodyMd, color: colors.onSurface, flex: 1 },
  datePlaceholder: { color: colors.onSurfaceVariant },
  iosPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  iosPickerSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xl,
  },
  iosPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow,
  },
  iosPickerTitle: { ...typography.titleLg, color: colors.onSurface },
  iosPickerCancel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  iosPickerDone: { ...typography.labelMd, color: colors.primary },
});
