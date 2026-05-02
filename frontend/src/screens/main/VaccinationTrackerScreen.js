import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const STATUS_STYLES = {
  overdue: { bg: colors.errorContainer, fg: colors.onErrorContainer, label: 'Overdue' },
  due_soon: { bg: '#fff0c3', fg: '#7a5c00', label: 'Due Soon' },
  upcoming: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant, label: 'Upcoming' },
  completed: { bg: colors.secondaryFixed, fg: colors.onSecondaryFixedVariant, label: 'Administered' },
};

const formatDisplay = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function VaccinationTrackerScreen({ navigation, route }) {
  const { petId } = route.params;
  const { pets, addVaccination, markVaccinationComplete, deleteVaccination } = useData();
  const pet = pets.find((p) => p.id === petId);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', dueDate: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);

  if (!pet) return null;

  const vaccinations = pet.vaccinations || [];
  const upcoming = vaccinations.filter((v) => v.status !== 'completed');
  const completed = vaccinations.filter((v) => v.status === 'completed');

  const dueDateObj = form.dueDate ? new Date(form.dueDate + 'T12:00:00') : new Date();

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setForm((f) => ({ ...f, dueDate: selectedDate.toISOString().split('T')[0] }));
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.dueDate) {
      Alert.alert('Missing Fields', 'Please fill in vaccine name and due date.');
      return;
    }
    await addVaccination(petId, {
      name: form.name.trim(),
      dueDate: form.dueDate,
      status: 'upcoming',
      administeredDate: null,
    });
    setForm({ name: '', dueDate: '' });
    setModal(false);
  };

  const confirmComplete = (vax) => {
    Alert.alert(
      'Mark as Administered',
      `Mark "${vax.name}" as administered today?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => markVaccinationComplete(petId, vax.id) },
      ]
    );
  };

  const confirmDelete = (vax) => {
    Alert.alert(
      'Delete Record',
      `Delete "${vax.name}" record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteVaccination(petId, vax.id) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Vaccination Tracker</Text>
            <Text style={styles.pageSubtitle}>Keep track of {pet.name}'s health milestones.</Text>
          </View>
        </View>

        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <Text style={styles.empty}>No upcoming vaccinations.</Text>
          ) : (
            upcoming.map((vax) => (
              <VaxCard
                key={vax.id}
                vax={vax}
                onComplete={() => confirmComplete(vax)}
                onDelete={() => confirmDelete(vax)}
              />
            ))
          )}
        </Section>

        <Section title="Completed">
          {completed.length === 0 ? (
            <Text style={styles.empty}>No completed vaccinations yet.</Text>
          ) : (
            completed.map((vax) => (
              <VaxCard key={vax.id} vax={vax} onDelete={() => confirmDelete(vax)} />
            ))
          )}
        </Section>

        <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="needle" size={18} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>Schedule New Vaccination</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Vaccination Modal */}
      <Modal visible={modal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Vaccination</Text>
            <View style={{ gap: spacing.sm }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.inputLabel}>Vaccine Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rabies Booster"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  autoFocus
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={styles.inputLabel}>Due Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <MaterialCommunityIcons name="calendar" size={18} color={colors.primaryContainer} />
                  <Text style={[styles.dateBtnText, !form.dueDate && styles.datePlaceholder]}>
                    {form.dueDate ? formatDisplay(form.dueDate) : 'Select due date'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModal(false); setForm({ name: '', dueDate: '' }); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
                <Text style={styles.confirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android date picker — renders outside the modal */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dueDateObj}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {/* iOS date picker — nested modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <View style={styles.iosHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.iosCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.iosTitle}>Due Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.iosDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dueDateObj}
                mode="date"
                display="spinner"
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

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.timeline}>{children}</View>
    </View>
  );
}

function VaxCard({ vax, onComplete, onDelete }) {
  const s = STATUS_STYLES[vax.status] || STATUS_STYLES.upcoming;
  const isComplete = vax.status === 'completed';

  return (
    <View style={[styles.vaxCard, isComplete && styles.vaxCardComplete]}>
      <View style={[styles.dot, { backgroundColor: isComplete ? colors.secondaryFixed : colors.surfaceContainerHigh }]}>
        {isComplete ? (
          <MaterialCommunityIcons name="check-circle" size={16} color={colors.secondary} />
        ) : (
          <MaterialCommunityIcons name="calendar-today" size={13} color={colors.outline} />
        )}
      </View>
      <View style={styles.vaxContent}>
        <View style={styles.vaxHeader}>
          <Text style={styles.vaxName}>{vax.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            {isComplete && <MaterialCommunityIcons name="check-decagram" size={12} color={s.fg} style={{ marginRight: 2 }} />}
            <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
          </View>
        </View>
        <View style={styles.vaxDateRow}>
          <MaterialCommunityIcons name="calendar" size={14} color={colors.outline} />
          <Text style={styles.vaxDate}>
            {isComplete ? `Administered: ${vax.administeredDate?.split('T')[0] || 'Done'}` : `Due: ${vax.dueDate}`}
          </Text>
        </View>
        <View style={styles.vaxActions}>
          {!isComplete && onComplete && (
            <TouchableOpacity style={styles.completeBtn} onPress={onComplete}>
              <MaterialCommunityIcons name="check" size={14} color={colors.secondary} />
              <Text style={styles.completeBtnText}>Mark Done</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <MaterialCommunityIcons name="delete-outline" size={16} color={colors.outline} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  topRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  back: {
    width: 40, height: 40, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  pageTitle: { ...typography.headlineMd, color: colors.onSurface },
  pageSubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  section: { paddingHorizontal: spacing.margin, marginTop: spacing.lg },
  sectionTitle: { ...typography.titleLg, color: colors.onSurface, marginBottom: spacing.md },
  timeline: { gap: spacing.sm },
  vaxCard: {
    backgroundColor: colors.surfaceContainerLowest, borderRadius: radii.xl,
    padding: spacing.md, flexDirection: 'row', gap: spacing.md,
    alignItems: 'flex-start', ...shadows.card,
  },
  vaxCardComplete: { opacity: 0.85 },
  dot: {
    width: 32, height: 32, borderRadius: radii.full,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.surfaceContainerLowest, flexShrink: 0,
  },
  vaxContent: { flex: 1, gap: spacing.xs },
  vaxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vaxName: { ...typography.titleLg, color: colors.onSurface, flex: 1, marginRight: spacing.sm },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.full,
  },
  statusText: { ...typography.labelSm },
  vaxDateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vaxDate: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  vaxActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.secondaryFixed,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full,
  },
  completeBtnText: { ...typography.labelSm, color: colors.secondary },
  deleteBtn: { marginLeft: 'auto' },
  empty: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    marginHorizontal: spacing.margin, borderRadius: radii.lg, marginTop: spacing.xl,
    shadowColor: colors.primaryContainer, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 5,
  },
  addBtnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md,
  },
  sheetTitle: { ...typography.titleLg, color: colors.onSurface },
  inputLabel: { ...typography.labelMd, color: colors.onSurface },
  input: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant,
    ...typography.bodyMd, color: colors.onSurface,
  },
  dateBtn: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant,
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  dateBtnText: { ...typography.bodyMd, color: colors.onSurface, flex: 1 },
  datePlaceholder: { color: colors.onSurfaceVariant },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh, alignItems: 'center',
  },
  cancelText: { ...typography.labelMd, color: colors.onSurface },
  confirmBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  confirmText: { ...typography.labelMd, color: colors.onPrimary },
  iosOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  iosSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xl,
  },
  iosHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow,
  },
  iosTitle: { ...typography.titleLg, color: colors.onSurface },
  iosCancel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  iosDone: { ...typography.labelMd, color: colors.primary },
});
