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
  overdue: { bg: colors.errorContainer, fg: colors.onErrorContainer, label: 'Overdue', dot: colors.error, icon: 'alert-circle-outline' },
  due_soon: { bg: colors.dueSoonBg, fg: colors.dueSoonFg, label: 'Due Soon', dot: '#d4a000', icon: 'clock-alert-outline' },
  upcoming: { bg: colors.tertiaryFixed, fg: colors.tertiary, label: 'Upcoming', dot: colors.tertiary, icon: 'calendar-clock' },
  completed: { bg: colors.successBg, fg: colors.successFg, label: 'Administered', dot: colors.successFg, icon: 'check-circle-outline' },
};

const formatDisplay = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      Alert.alert('Missing Fields', 'Please fill in the vaccine name and due date.');
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

  const petColor = pet.color || colors.primaryFixed;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Vaccinations</Text>
            <Text style={styles.pageSubtitle}>{pet.name}'s health records</Text>
          </View>
          <View style={[styles.petBadge, { backgroundColor: petColor }]}>
            <Text style={styles.petBadgeText}>{pet.name[0]}</Text>
          </View>
        </View>

        {/* Stats summary */}
        <View style={styles.summaryRow}>
          <SummaryChip
            icon="calendar-clock"
            label="Upcoming"
            value={upcoming.length}
            bg={colors.tertiaryFixed}
            fg={colors.tertiary}
          />
          <SummaryChip
            icon="check-circle-outline"
            label="Completed"
            value={completed.length}
            bg={colors.successBg}
            fg={colors.successFg}
          />
          <SummaryChip
            icon="needle"
            label="Total"
            value={vaccinations.length}
            bg={colors.primaryFixed}
            fg={colors.primaryContainer}
          />
        </View>

        {/* Upcoming */}
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.successFg} />
              <Text style={styles.emptyText}>All vaccinations up to date!</Text>
            </View>
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

        {/* Completed */}
        {completed.length > 0 && (
          <Section title="Completed" count={completed.length}>
            {completed.map((vax) => (
              <VaxCard key={vax.id} vax={vax} onDelete={() => confirmDelete(vax)} />
            ))}
          </Section>
        )}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setModal(true)}
          activeOpacity={0.88}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>Schedule New Vaccination</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Vaccination Modal */}
      <Modal visible={modal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Vaccination</Text>
            <View style={{ gap: spacing.md }}>
              <View style={{ gap: 8 }}>
                <Text style={styles.inputLabel}>Vaccine Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Rabies Booster"
                  placeholderTextColor={colors.outlineVariant}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  autoFocus
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.inputLabel}>Due Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.88}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primaryContainer} />
                  <Text style={[styles.dateBtnText, !form.dueDate && styles.datePlaceholder]}>
                    {form.dueDate ? formatDisplay(form.dueDate) : 'Select due date'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setModal(false); setForm({ name: '', dueDate: '' }); }}
                activeOpacity={0.88}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd} activeOpacity={0.88}>
                <Text style={styles.confirmText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dueDateObj}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <View style={styles.sheetHandle} />
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

function SummaryChip({ icon, label, value, bg, fg }) {
  return (
    <View style={[styles.summaryChip, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon} size={18} color={fg} />
      <Text style={[styles.summaryValue, { color: fg }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Section({ title, count, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      <View style={styles.timeline}>{children}</View>
    </View>
  );
}

function VaxCard({ vax, onComplete, onDelete }) {
  const s = STATUS_STYLES[vax.status] || STATUS_STYLES.upcoming;
  const isComplete = vax.status === 'completed';

  return (
    <View style={[styles.vaxCard, isComplete && styles.vaxCardComplete]}>
      {/* Timeline dot */}
      <View style={styles.dotColumn}>
        <View style={[styles.dot, { backgroundColor: s.bg, borderColor: s.dot }]}>
          <MaterialCommunityIcons name={s.icon} size={14} color={s.fg} />
        </View>
        <View style={styles.dotLine} />
      </View>

      <View style={styles.vaxContent}>
        <View style={styles.vaxHeader}>
          <Text style={styles.vaxName}>{vax.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
          </View>
        </View>
        <View style={styles.vaxDateRow}>
          <MaterialCommunityIcons name="calendar-outline" size={13} color={colors.outline} />
          <Text style={styles.vaxDate}>
            {isComplete
              ? `Administered: ${formatDisplay(vax.administeredDate?.split('T')[0]) || 'Done'}`
              : `Due: ${formatDisplay(vax.dueDate) || vax.dueDate}`
            }
          </Text>
        </View>
        <View style={styles.vaxActions}>
          {!isComplete && onComplete && (
            <TouchableOpacity style={styles.completeBtn} onPress={onComplete} activeOpacity={0.88}>
              <MaterialCommunityIcons name="check" size={13} color={colors.successFg} />
              <Text style={styles.completeBtnText}>Mark Done</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onDelete}
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  pageTitle: { ...typography.headlineMd, color: colors.onSurface },
  pageSubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 14 },
  petBadge: {
    width: 46,
    height: 46,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  petBadgeText: { ...typography.headlineMd, color: colors.primaryContainer, fontSize: 20 },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    marginBottom: spacing.md,
  },
  summaryChip: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.xl,
    alignItems: 'center',
    gap: 2,
    minHeight: 76,
    justifyContent: 'center',
  },
  summaryValue: { ...typography.headlineMd, fontSize: 22, lineHeight: 28 },
  summaryLabel: { ...typography.labelSm, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },
  section: { paddingHorizontal: spacing.margin, marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.titleLg, color: colors.onSurface },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  countText: { ...typography.labelSm, color: colors.onSurfaceVariant, fontFamily: 'PlusJakartaSans_600SemiBold' },
  timeline: { gap: spacing.sm },
  vaxCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  vaxCardComplete: { opacity: 0.8 },
  dotColumn: { alignItems: 'center', width: 32 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  dotLine: { flex: 1, width: 2, backgroundColor: colors.surfaceContainerHigh, marginTop: 4, minHeight: 12 },
  vaxContent: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  vaxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vaxName: { ...typography.titleLg, color: colors.onSurface, flex: 1, marginRight: spacing.sm, fontSize: 16 },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    flexShrink: 0,
  },
  statusText: { ...typography.labelSm, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  vaxDateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vaxDate: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 13 },
  vaxActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.successBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: 'rgba(26,107,58,0.05)',
  },
  completeBtnText: { ...typography.labelSm, color: colors.successFg, fontFamily: 'PlusJakartaSans_600SemiBold' },
  deleteBtn: { marginLeft: 'auto', padding: 2 },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.successBg,
  },
  emptyText: { ...typography.bodyMd, color: colors.successFg, fontSize: 14 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.margin,
    borderRadius: radii.xl,
    marginTop: spacing.sm,
    minHeight: 56,
    ...shadows.button,
  },
  addBtnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.outlineVariant,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sheetTitle: { ...typography.titleLg, color: colors.onSurface },
  inputLabel: { ...typography.labelMd, color: colors.onSurface },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    ...typography.bodyMd,
    color: colors.onSurface,
    minHeight: 52,
  },
  dateBtn: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateBtnText: { ...typography.bodyMd, color: colors.onSurface, flex: 1 },
  datePlaceholder: { color: colors.outlineVariant },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  cancelText: { ...typography.labelMd, color: colors.onSurface },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
    ...shadows.button,
  },
  confirmText: { ...typography.labelMd, color: colors.onPrimary },
  iosOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  iosSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingBottom: spacing.xl,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  iosTitle: { ...typography.titleLg, color: colors.onSurface },
  iosCancel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  iosDone: { ...typography.labelMd, color: colors.primary },
});
