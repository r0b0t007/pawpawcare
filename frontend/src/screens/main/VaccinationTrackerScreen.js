import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { ui, type, radii, petPair, photos } from '../../theme';
import { emptyPhotoFor } from '../../utils/pets';
import { Card, Button, Sheet, ConfirmDialog, EmptyState, PetFace, StatusPill, showToast, ScreenHeader, DeleteButton, TextField } from '../../components';
import { useInFlight } from '../../hooks/useInFlight';
import { useToday } from '../../hooks/useToday';
import { fmtFull, overdueLabel, parseDay, relativeDay } from '../../utils/dates';

// "Lively & Light" vaccine tracker: the pet's face on its identity tint, one
// plain sentence about where things stand, then the records grouped the way
// the Health hub groups them — Needs attention / Upcoming / Done. Each open
// record shows its status exactly once (a pill, or a quiet relative date for
// records that aren't due yet). One primary action: "Add vaccine".

const hit = { top: 8, bottom: 8, left: 8, right: 8 };
// 44pt target around a small icon.

// 'Oct 12, 2026' (null for a missing date, so callers can fall back).
const formatDisplay = (iso) => (iso ? fmtFull(parseDay(iso)) : null);

const byDue = (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '');

// Where things stand, in one sentence — never alarming, never shaming.
function summaryLine(needs, upcoming, done, today) {
  if (needs.length === 1) return `${needs[0].name} needs booking`;
  if (needs.length > 1) return `${needs.length} vaccines need booking`;
  if (upcoming.length) {
    const next = upcoming[0];
    return `Next: ${next.name} ${relativeDay(parseDay(next.dueDate), today)}`;
  }
  if (done.length) return 'Everything is up to date';
  return 'No vaccine records yet';
}

export default function VaccinationTrackerScreen({ navigation, route }) {
  const { petId } = route.params;
  const { pets, addVaccination, markVaccinationComplete, deleteVaccination } = useData();
  const pet = pets.find((p) => p.id === petId);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', dueDate: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // Hooks above the early return (hook order): one add per tap, and "today"
  // that rolls over at midnight for the relative dates and overdue labels.
  const { run, isBusy } = useInFlight();
  const today = useToday();

  const groups = useMemo(() => {
    const vaccinations = pet?.vaccinations || [];
    return {
      needs: vaccinations.filter((v) => v.status === 'overdue').sort(byDue),
      upcoming: vaccinations
        .filter((v) => v.status === 'due_soon' || v.status === 'upcoming')
        .sort(byDue),
      done: vaccinations
        .filter((v) => v.status === 'completed')
        .sort((a, b) => (b.administeredDate || b.dueDate || '').localeCompare(a.administeredDate || a.dueDate || '')),
    };
  }, [pet?.vaccinations]);

  if (!pet) return null;

  const { needs, upcoming, done } = groups;
  const hasAny = needs.length + upcoming.length + done.length > 0;
  const pair = petPair(pet.color);

  const dueDateObj = form.dueDate ? parseDay(form.dueDate) : new Date();

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setForm((f) => ({ ...f, dueDate: selectedDate.toISOString().split('T')[0] }));
    }
  };

  const closeSheet = () => { setModal(false); setForm({ name: '', dueDate: '' }); };

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
      closeSheet();
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

  // An open record: name, its date in plain language, and its status once —
  // a pill when it needs attention or is due soon, a quiet relative date
  // otherwise.
  const renderOpen = (vax, i, list) => {
    const date = parseDay(vax.dueDate);
    const pill =
      vax.status === 'overdue'
        ? <StatusPill status="overdue" label={overdueLabel(vax.dueDate, today)} style={styles.rowPill} />
        : vax.status === 'due_soon'
          ? <StatusPill status="due" label={`Due ${relativeDay(date, today)}`} style={styles.rowPill} />
          : null;
    return (
      <View key={vax.id} style={[styles.row, i < list.length - 1 && styles.rowDivider]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>{vax.name}</Text>
          <Text style={styles.rowSub}>
            {vax.status === 'overdue' ? 'Was due ' : 'Due '}
            {formatDisplay(vax.dueDate) || vax.dueDate}
          </Text>
          {pill}
        </View>
        {!pill && <Text style={styles.rowWhen}>{relativeDay(date, today)}</Text>}
        <Button small variant="soft" icon="check" label="Done" accessibilityLabel={`Mark ${vax.name} done`} onPress={() => confirmComplete(vax)} />
        <DeleteButton label={`Delete ${vax.name}`} onPress={() => confirmDelete(vax)} size={18} />
      </View>
    );
  };

  const renderDone = (vax, i, list) => (
    <View key={vax.id} style={[styles.doneRow, i < list.length - 1 && styles.rowDivider]}>
      <MaterialCommunityIcons name="check-circle" size={18} color={ui.success} />
      <Text style={styles.doneTitle} numberOfLines={1}>{vax.name}</Text>
      <Text style={styles.doneDate}>
        {formatDisplay(vax.administeredDate?.split('T')[0]) || 'Done'}
      </Text>
      <DeleteButton label={`Delete ${vax.name}`} onPress={() => confirmDelete(vax)} size={16} />
    </View>
  );

  const section = (label, list, render) =>
    list.length > 0 && (
      <>
        <Text style={[type.sectionLabel, styles.sectionLabel]}>{label}</Text>
        <Card style={styles.sectionCard}>{list.map(render)}</Card>
      </>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenHeader title="Vaccines" onBack={() => navigation.goBack()} />

        {/* The pet, recognised by face and tint, and one sentence on where
            things stand — the detail is in the groups below. */}
        <View style={[styles.petCard, { backgroundColor: pair.bg }]}>
          <PetFace pet={pet} size={56} ring={false} glyph />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.petName, { color: pair.fg }]} numberOfLines={1}>{pet.name}</Text>
            <Text style={styles.petSummary}>{summaryLine(needs, upcoming, done, today)}</Text>
          </View>
        </View>

        {hasAny ? (
          <>
            {section('Needs attention', needs, renderOpen)}
            {section('Upcoming', upcoming, renderOpen)}
            {section('Done', done, renderDone)}
            <Button
              icon="plus"
              label="Add vaccine"
              onPress={() => setModal(true)}
              style={styles.addBtn}
            />
          </>
        ) : (
          <EmptyState
            photo={emptyPhotoFor(pet, photos.emptyKitten)}
            title="No vaccines yet"
            body={`Add ${pet.name}'s vaccines and we'll remind you before each one is due.`}
            actionLabel="Add vaccine"
            actionIcon="plus"
            onAction={() => setModal(true)}
            style={styles.empty}
          />
        )}
      </ScrollView>

      {/* Add vaccine sheet */}
      <Sheet visible={modal} onClose={closeSheet} title="New vaccine">
        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Vaccine name</Text>
          <TextField
            placeholder="e.g. Rabies booster"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            autoFocus
            accessibilityLabel="Vaccine name"
          />
        </View>

        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Due date</Text>
          <Pressable
            style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: ui.pressTint }]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Due date, ${form.dueDate ? formatDisplay(form.dueDate) : 'not set'}`}
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
          disabled={!form.name.trim() || !form.dueDate || isBusy('add')}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 22,
    padding: 16,
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  petName: { ...type.cardTitle },
  petSummary: { ...type.body, color: ui.ink, marginTop: 2 },
  sectionLabel: { marginHorizontal: 24, marginBottom: 10, marginTop: 4, color: ui.subtle },
  sectionCard: { marginHorizontal: 16, marginBottom: 18 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 16,
  },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  rowPill: { marginTop: 6 },
  rowWhen: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: ui.sub },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 16,
  },
  doneTitle: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: ui.ink,
  },
  doneDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle },
  addBtn: { marginHorizontal: 16, marginTop: 4 },
  empty: { paddingHorizontal: 24, paddingTop: 12 },
  fieldLabel: { color: ui.subtle, marginBottom: 8 },
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
    backgroundColor: ui.overlay,
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
