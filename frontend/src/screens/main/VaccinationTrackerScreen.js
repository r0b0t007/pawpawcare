import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { ui, type, radii, petPair } from '../../theme';
import { Card, Button, Sheet, ConfirmDialog, StatusPill, showToast } from '../../components';
import { useInFlight } from '../../hooks/useInFlight';
import { fmtFull, parseDay } from '../../utils/dates';

// Health statuses render through StatusPill; 'upcoming' stays a neutral date row.
const PILL_STATUS = { overdue: 'overdue', due_soon: 'due' };

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

// 'Oct 12, 2026' (null for a missing date, so callers can fall back).
const formatDisplay = (iso) => (iso ? fmtFull(parseDay(iso)) : null);

export default function VaccinationTrackerScreen({ navigation, route }) {
  const { petId } = route.params;
  const { pets, addVaccination, markVaccinationComplete, deleteVaccination } = useData();
  const pet = pets.find((p) => p.id === petId);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', dueDate: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // One add per tap — declared above the early return (hook order).
  const { run } = useInFlight();
  if (!pet) return null;

  const vaccinations = pet.vaccinations || [];
  const upcoming = vaccinations.filter((v) => v.status !== 'completed');
  const completed = vaccinations.filter((v) => v.status === 'completed');

  const dueDateObj = form.dueDate ? parseDay(form.dueDate) : new Date();

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setForm((f) => ({ ...f, dueDate: selectedDate.toISOString().split('T')[0] }));
    }
  };

  const handleAdd = () => {
    if (!form.name.trim() || !form.dueDate) return undefined;
    return run('add', async () => {
      const saved = await addVaccination(petId, {
        name: form.name.trim(),
        dueDate: form.dueDate,
        status: 'upcoming',
        administeredDate: null,
      });
      if (!saved) {
        showToast("Couldn't schedule the vaccination. Try again.");
        return;
      }
      setForm({ name: '', dueDate: '' });
      setModal(false);
      showToast('Vaccination scheduled');
    });
  };

  const confirmComplete = (vax) =>
    setConfirm({
      title: 'Mark as administered',
      message: `Mark "${vax.name}" as administered today?`,
      confirmLabel: 'Mark done',
      action: async () => {
        const saved = await markVaccinationComplete(petId, vax.id);
        if (saved) showToast(`${vax.name} marked done`, { celebrate: true, actionType: 'vaccination_done' });
        else showToast(`Couldn't mark ${vax.name} done. Try again.`);
      },
    });

  const confirmDelete = (vax) =>
    setConfirm({
      title: 'Delete record',
      message: `Delete "${vax.name}" record?`,
      confirmLabel: 'Delete',
      destructive: true,
      action: async () => {
        if (await deleteVaccination(petId, vax.id)) showToast('Record deleted');
        else showToast("Couldn't delete the record. Try again.");
      },
    });

  const petBg = pet.color || ui.accentTint;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.topRow}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
            onPress={() => navigation.goBack()}
            hitSlop={hit}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Vaccinations</Text>
            <Text style={styles.pageSubtitle}>{pet.name}'s health records</Text>
          </View>
          <View style={[styles.petBadge, { backgroundColor: petBg }]}>
            <Text style={[styles.petBadgeText, { color: petPair(pet.color).fg }]}>{pet.name[0]}</Text>
          </View>
        </View>

        {/* Stats summary */}
        <View style={styles.statsRow}>
          <Stat value={upcoming.length} label="Upcoming" />
          <Stat value={completed.length} label="Completed" />
          <Stat value={vaccinations.length} label="Total" />
        </View>

        {/* Upcoming */}
        <Text style={[type.sectionLabel, styles.sectionLabel]}>Upcoming</Text>
        <Card style={styles.sectionCard}>
          {upcoming.length === 0 ? (
            <View style={styles.emptyRow}>
              <MaterialCommunityIcons name="check-circle" size={18} color={ui.ringOk} />
              <Text style={styles.emptyText}>All vaccinations up to date!</Text>
            </View>
          ) : (
            upcoming.map((vax, i) => (
              <View
                key={vax.id}
                style={[styles.vaxRow, i < upcoming.length - 1 && styles.rowDivider]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>{vax.name}</Text>
                  <Text style={styles.rowSub}>Due {formatDisplay(vax.dueDate) || vax.dueDate}</Text>
                  {PILL_STATUS[vax.status] ? (
                    <StatusPill status={PILL_STATUS[vax.status]} style={{ marginTop: 4 }} />
                  ) : null}
                </View>
                <Button small variant="soft" label="Mark done" onPress={() => confirmComplete(vax)} />
                <Pressable onPress={() => confirmDelete(vax)} hitSlop={hit}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={ui.faint} />
                </Pressable>
              </View>
            ))
          )}
        </Card>

        {/* History */}
        {completed.length > 0 && (
          <>
            <Text style={[type.sectionLabel, styles.sectionLabel]}>History</Text>
            <Card style={styles.sectionCard}>
              {completed.map((vax, i) => (
                <View
                  key={vax.id}
                  style={[styles.historyRow, i < completed.length - 1 && styles.rowDivider]}
                >
                  <MaterialCommunityIcons name="check-circle" size={18} color={ui.ringOk} />
                  <Text style={styles.historyTitle}>{vax.name}</Text>
                  <Text style={styles.historyDate}>
                    {formatDisplay(vax.administeredDate?.split('T')[0]) || 'Done'}
                  </Text>
                  <Pressable onPress={() => confirmDelete(vax)} hitSlop={hit}>
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={ui.faint} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        )}

        <Button
          icon="plus"
          label="Schedule vaccination"
          onPress={() => setModal(true)}
          style={styles.addBtn}
        />
      </ScrollView>

      {/* Add vaccination sheet */}
      <Sheet
        visible={modal}
        onClose={() => { setModal(false); setForm({ name: '', dueDate: '' }); }}
        title="New vaccination"
      >
        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Vaccine name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rabies booster"
            placeholderTextColor={ui.subtle}
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            autoFocus
          />
        </View>

        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Due date</Text>
          <Pressable
            style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: ui.pressTint }]}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={ui.accent} />
            <Text style={[styles.dateText, !form.dueDate && { color: ui.subtle }]}>
              {form.dueDate ? formatDisplay(form.dueDate) : 'Select due date'}
            </Text>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={ui.faint} />
          </Pressable>
        </View>

        <Button
          label="Schedule"
          onPress={handleAdd}
          disabled={!form.name.trim() || !form.dueDate}
        />
      </Sheet>

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
              <View style={styles.iosHandle} />
              <View style={styles.iosHeader}>
                <Pressable onPress={() => setShowDatePicker(false)} hitSlop={hit}>
                  <Text style={styles.iosCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.iosTitle}>Due date</Text>
                <Pressable onPress={() => setShowDatePicker(false)} hitSlop={hit}>
                  <Text style={styles.iosDone}>Done</Text>
                </Pressable>
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

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const a = confirm?.action; setConfirm(null); a?.(); }}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 18,
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
  pageTitle: { ...type.screenTitle, color: ui.ink },
  pageSubtitle: { ...type.secondary, color: ui.sub, marginTop: 2 },
  petBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petBadgeText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 1 },
  statValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 21,
    letterSpacing: -0.3,
    color: ui.ink,
  },
  statLabel: { ...type.secondary, fontSize: 11, color: ui.subtle },
  sectionLabel: { marginHorizontal: 24, marginBottom: 10, marginTop: 6, color: ui.subtle },
  sectionCard: { marginHorizontal: 24, marginBottom: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  vaxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  historyTitle: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: ui.ink,
  },
  historyDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  emptyText: { ...type.body, fontSize: 13, color: ui.sub },
  addBtn: { marginHorizontal: 24, marginTop: 4 },
  fieldLabel: { color: ui.subtle, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  dateText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: ui.ink,
  },
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(36, 26, 14, 0.35)',
  },
  iosSheet: {
    backgroundColor: ui.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
    paddingTop: 14,
    paddingBottom: 30,
  },
  iosHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ui.controlBorder,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  iosTitle: { ...type.cardTitleSm, color: ui.ink },
  iosCancel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13.5, color: ui.sub },
  iosDone: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
});
