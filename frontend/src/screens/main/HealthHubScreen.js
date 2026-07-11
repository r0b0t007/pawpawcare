import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { ui, type, radii, PET_COLOR_PAIRS } from '../../theme';
import { Card, Chip, Button, Sheet, showToast } from '../../components';

// The Health hub: one place for everything time-based — overdue vaccines up
// top ("needs attention"), the upcoming schedule grouped by month, and a done
// history. Absorbs the old Schedule lists; the per-pet tracker and medical
// records remain reachable from each row until phase 4 folds them in fully.

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

const fmtShort = (date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const RECORD_TYPES = ['Vaccine', 'Vet visit', 'Medication', 'Weight'];

const defaultDueDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d;
};

export default function HealthHubScreen({ navigation }) {
  const { pets, reminders, addVaccination, markVaccinationComplete } = useData();

  const [filter, setFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recType, setRecType] = useState('Vaccine');
  const [recPetId, setRecPetId] = useState(null);
  const [recName, setRecName] = useState('');
  const [recDate, setRecDate] = useState(defaultDueDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const shownPets = filter === 'all' ? pets : pets.filter((p) => p.id === filter);
  const recPet = pets.find((p) => p.id === recPetId) || pets[0];

  const { overdue, months, history } = useMemo(() => {
    const vax = shownPets.flatMap((pet) =>
      (pet.vaccinations || []).map((v) => ({ ...v, pet }))
    );
    const overdueVax = vax
      .filter((v) => v.status === 'overdue')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const upcoming = [
      ...vax
        .filter((v) => v.status === 'due_soon' || v.status === 'upcoming')
        .map((v) => ({
          key: `vax-${v.pet.id}-${v.id}`,
          date: new Date(`${v.dueDate}T12:00:00`),
          title: v.name,
          sub: v.pet.name,
          chipLabel: v.pet.name[0],
          chipBg: v.pet.color || ui.accentTint,
          onPress: () => navigation.navigate('VaccinationTracker', { petId: v.pet.id }),
        })),
      ...(filter === 'all'
        ? reminders
            .filter((r) => r.next_fire_at || r.fire_at)
            .map((r) => ({
              key: `rem-${r.id}`,
              date: new Date(r.next_fire_at || r.fire_at),
              title: r.title,
              sub:
                r.schedule_type === 'recurring'
                  ? `${(r.recurrence || 'daily').replace(/^\w/, (c) => c.toUpperCase())} reminder`
                  : 'Reminder',
              icon: 'bell-outline',
              onPress: () => navigation.navigate('Reminders'),
            }))
        : []),
    ]
      .filter((item) => !Number.isNaN(item.date.getTime()))
      .sort((a, b) => a.date - b.date);

    const byMonth = [];
    for (const item of upcoming) {
      const label = MONTHS[item.date.getMonth()];
      const bucket = byMonth[byMonth.length - 1];
      if (bucket && bucket.label === label) bucket.items.push(item);
      else byMonth.push({ label, items: [item] });
    }

    const done = vax
      .filter((v) => v.status === 'completed')
      .sort((a, b) => (b.administeredDate || b.dueDate || '').localeCompare(a.administeredDate || a.dueDate || ''));

    return { overdue: overdueVax, months: byMonth, history: done };
  }, [shownPets, reminders, filter, navigation]);

  const openSheet = () => {
    if (!pets.length) {
      showToast('Add a pet first');
      return;
    }
    setRecType('Vaccine');
    setRecPetId(pets[0].id);
    setRecName('');
    setRecDate(defaultDueDate());
    setSheetOpen(true);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) setRecDate(selectedDate);
  };

  const saveVaccine = async () => {
    if (!recName.trim() || !recPet || saving) return;
    setSaving(true);
    try {
      await addVaccination(recPet.id, {
        name: recName.trim(),
        dueDate: recDate.toISOString().split('T')[0],
        status: 'upcoming',
        administeredDate: null,
      });
      setSheetOpen(false);
      showToast('Record saved');
    } finally {
      setSaving(false);
    }
  };

  const continueElsewhere = () => {
    if (!recPet) return;
    setSheetOpen(false);
    if (recType === 'Vet visit') {
      navigation.navigate('MedicalRecords', { petId: recPet.id, petName: recPet.name });
    } else {
      navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: recPet.id } });
    }
  };

  const markDone = async (v) => {
    await markVaccinationComplete(v.pet.id, v.id);
    showToast(`${v.name} marked done`);
  };

  const daysOverdue = (v) =>
    Math.max(1, Math.floor((Date.now() - new Date(`${v.dueDate}T12:00:00`)) / 86400000));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={[type.screenTitle, { color: ui.ink }]}>Health</Text>
          <Button pill icon="plus" label="Add record" onPress={openSheet} />
        </View>

        {pets.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
            {pets.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                active={filter === p.id}
                onPress={() => setFilter(p.id)}
              />
            ))}
          </ScrollView>
        )}

        {overdue.length > 0 && (
          <>
            <Text style={[type.sectionLabel, styles.sectionLabel, { color: ui.danger }]}>
              Needs attention
            </Text>
            <Card style={styles.sectionCard}>
              {overdue.map((v, i) => (
                <View
                  key={`${v.pet.id}-${v.id}`}
                  style={[styles.attentionRow, i < overdue.length - 1 && styles.rowDivider]}
                >
                  <View style={[styles.petDot, { backgroundColor: v.pet.color || ui.accentTint }]}>
                    <Text style={[styles.petDotText, { color: petFg(v.pet.color) }]}>
                      {v.pet.name[0]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attentionTitle}>{v.name}</Text>
                    <Text style={styles.attentionSub}>
                      Due {fmtShort(new Date(`${v.dueDate}T12:00:00`))} · {daysOverdue(v)} days overdue
                    </Text>
                  </View>
                  <Button small label="Mark done" onPress={() => markDone(v)} />
                </View>
              ))}
            </Card>
          </>
        )}

        {months.length === 0 ? (
          <Card style={[styles.sectionCard, { marginTop: 4 }]}>
            <Text style={styles.emptyText}>
              {pets.length
                ? 'Nothing scheduled for this pet.'
                : 'Add your first pet to start tracking health.'}
            </Text>
          </Card>
        ) : (
          months.map((month) => (
            <View key={month.label}>
              <Text style={[type.sectionLabel, styles.sectionLabel, { color: ui.subtle }]}>
                {month.label}
              </Text>
              <Card style={styles.sectionCard}>
                {month.items.map((item, i) => (
                  <Pressable
                    key={item.key}
                    onPress={item.onPress}
                    style={({ pressed }) => [
                      styles.scheduleRow,
                      i < month.items.length - 1 && styles.rowDivider,
                      pressed && { backgroundColor: '#fffdf8' },
                    ]}
                  >
                    <View style={styles.dayCol}>
                      <Text style={styles.dayLabel}>{DAYS[item.date.getDay()]}</Text>
                      <Text style={styles.dayDate}>{item.date.getDate()}</Text>
                    </View>
                    {item.icon ? (
                      <View style={[styles.typeChip, { backgroundColor: ui.track }]}>
                        <MaterialCommunityIcons name={item.icon} size={15} color={ui.accent} />
                      </View>
                    ) : (
                      <View style={[styles.typeChip, { backgroundColor: item.chipBg }]}>
                        <Text style={[styles.typeChipText, { color: petFg(item.chipBg) }]}>
                          {item.chipLabel}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.rowSub}>{item.sub}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={ui.faint} />
                  </Pressable>
                ))}
              </Card>
            </View>
          ))
        )}

        {history.length > 0 && (
          <>
            <Text style={[type.sectionLabel, styles.sectionLabel, { color: ui.subtle }]}>
              History
            </Text>
            <Card style={[styles.sectionCard, { marginBottom: 28 }]}>
              {history.slice(0, 8).map((v, i) => (
                <View
                  key={`${v.pet.id}-${v.id}`}
                  style={[styles.historyRow, i < Math.min(history.length, 8) - 1 && styles.rowDivider]}
                >
                  <MaterialCommunityIcons name="check-circle" size={18} color={ui.ringOk} />
                  <Text style={styles.historyTitle}>
                    {v.name} — {v.pet.name}
                  </Text>
                  <Text style={styles.historyDate}>
                    {fmtShort(new Date(`${v.administeredDate || v.dueDate}T12:00:00`))}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="New record">
        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>Type</Text>
          <View style={styles.chipWrap}>
            {RECORD_TYPES.map((t) => (
              <Chip key={t} label={t} active={recType === t} onPress={() => setRecType(t)} />
            ))}
          </View>
        </View>

        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>Pet</Text>
          <View style={styles.chipWrap}>
            {pets.map((p) => {
              const on = recPet?.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setRecPetId(p.id)}
                  style={[styles.petChip, on && styles.petChipOn]}
                >
                  <View style={[styles.petChipAvatar, { backgroundColor: p.color || ui.accentTint }]}>
                    <Text style={[styles.petChipInitial, { color: petFg(p.color) }]}>
                      {p.name[0]}
                    </Text>
                  </View>
                  <Text style={styles.petChipLabel}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {recType === 'Vaccine' ? (
          <>
            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Rabies booster"
                placeholderTextColor={ui.subtle}
                value={recName}
                onChangeText={setRecName}
              />
            </View>
            <Pressable style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={ui.accent} />
              <Text style={styles.dateText}>
                Due {recDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={ui.faint} />
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={recDate}
                mode="date"
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}
            <Button
              label={`Save · ${fmtShort(recDate)}`}
              onPress={saveVaccine}
              disabled={!recName.trim() || saving}
            />
          </>
        ) : (
          <>
            <Text style={styles.redirectHint}>
              {recType === 'Vet visit'
                ? `Vet visits and documents are logged in ${recPet?.name ?? 'the pet'}'s medical records.`
                : `${recType}s are logged on ${recPet?.name ?? 'the pet'}'s profile.`}
            </Text>
            <Button label="Continue" onPress={continueElsewhere} />
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
  },
  filters: { gap: 8, paddingHorizontal: 24, paddingBottom: 20 },
  sectionLabel: { marginHorizontal: 24, marginBottom: 10, marginTop: 6 },
  sectionCard: { marginHorizontal: 24, marginBottom: 16 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  petDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petDotText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16 },
  attentionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.ink },
  attentionSub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    color: ui.sub,
    marginTop: 1,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  dayCol: { width: 40, alignItems: 'center' },
  dayLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: ui.subtle },
  dayDate: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: ui.ink },
  typeChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 13 },
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
  emptyText: {
    padding: 18,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: ui.subtle,
  },
  fieldLabel: { marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
  petChipOn: { backgroundColor: '#faf1e2', borderColor: ui.accent },
  petChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petChipInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11 },
  petChipLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: ui.ink,
  },
  redirectHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: ui.sub,
  },
});
