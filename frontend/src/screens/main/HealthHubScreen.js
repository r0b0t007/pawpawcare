import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { getPref } from '../../services/prefs';
import { fmtShort, fmtDay, dayDiff, overdueLabel, parseDay, relativeDay } from '../../utils/dates';
import { petById } from '../../utils/pets';
import { useToday } from '../../hooks/useToday';
import { useInFlight } from '../../hooks/useInFlight';
import { useTickAt } from '../../hooks/useTickAt';
import { ui, type, radii, motion, elevation, photos, vaultColors } from '../../theme';
import {
  Card, Chip, Button, Sheet, PetFace, StatusPill, EmptyState, showToast,
} from '../../components';

// The Health hub answers "what's due, and when?" — grouped by time the way
// people plan (Today / This week / Later), not by record type. Overdue items
// sit at the top of Today with one "Overdue" pill (status once, icon + word).
// Every row carries the pet's face, so multi-pet homes recognise before they
// read. The one primary action ("Add record") floats in the thumb zone.

const ROW_OUT = FadeOut.duration(150);
const ROW_LAYOUT = LinearTransition.duration(200);


const VAULT = vaultColors;

// "Synced just now" / "Synced 5m ago" / "Synced 2h ago" — quiet trust line.
const syncedLabel = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Synced just now';
  if (diff < 3600000) return `Synced ${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `Synced ${Math.floor(diff / 3600000)}h ago`;
  return `Synced ${Math.floor(diff / 86400000)}d ago`;
};

// "Tue 9:00 AM" — when the local notification for a reminder will fire.
const fmtDelivery = (date) =>
  `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

const RECORD_TYPES = ['Vaccine', 'Vet visit', 'Medication', 'Weight'];

const defaultDueDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d;
};

// Filter chip with the pet's face (photo, or species glyph on its tint).
function PetFilterChip({ pet, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={pet.name}
      accessibilityState={{ checked: !!active }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.faceChip,
        active && styles.faceChipOn,
        pressed && { opacity: motion.pressOpacitySoft },
      ]}
    >
      <PetFace pet={pet} size={28} ring={false} glyph />
      <Text style={styles.faceChipLabel}>{pet.name}</Text>
    </Pressable>
  );
}

export default function HealthHubScreen({ navigation }) {
  const { pets, reminders, lastSyncedAt, addVaccination, markVaccinationComplete } = useData();

  const [filter, setFilter] = useState('all');
  // The Health tab stays mounted — "today" must roll over at midnight.
  const today = useToday();
  // Whether local reminder notifications are on (Profile → "Care reminders").
  // null while loading — no delivery pill is shown until we know the truth.
  const [remindersPrefOn, setRemindersPrefOn] = useState(null);

  useEffect(() => {
    let alive = true;
    getPref('careReminders', true).then((v) => { if (alive) setRemindersPrefOn(!!v); });
    return () => { alive = false; };
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recType, setRecType] = useState('Vaccine');
  const [recPetId, setRecPetId] = useState(null);
  const [recName, setRecName] = useState('');
  const [recDate, setRecDate] = useState(defaultDueDate);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Memoised: a fresh filtered array every render would rerun the grouping
  // below on every keystroke and busy toggle.
  const shownPets = useMemo(
    () => (filter === 'all' ? pets : pets.filter((p) => p.id === filter)),
    [pets, filter],
  );
  const recPet = pets.find((p) => p.id === recPetId) || pets[0];

  // Re-run the grouping when the next reminder fires, so a Health tab left
  // open drops it from Today on time (this tab stays mounted).
  const reminderTimes = useMemo(
    () => reminders.map((r) => new Date(r.next_fire_at || r.fire_at).getTime()).filter(Number.isFinite),
    [reminders],
  );
  const reminderTick = useTickAt(reminderTimes);

  const { sections, history } = useMemo(() => {
    const now = new Date();
    const vax = shownPets.flatMap((pet) =>
      (pet.vaccinations || []).map((v) => ({ ...v, pet }))
    );
    const overdueItems = vax
      .filter((v) => v.status === 'overdue')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((v) => {
        const date = parseDay(v.dueDate);
        return {
          key: `od-${v.pet.id}-${v.id}`,
          date,
          title: v.name,
          sub: `${v.pet.name} · was due ${fmtDay(date)}`,
          pet: v.pet,
          overdueVax: v,
          onPress: () => navigation.navigate('VaccinationTracker', { petId: v.pet.id }),
        };
      });

    const upcoming = [
      ...vax
        .filter((v) => v.status === 'due_soon' || v.status === 'upcoming')
        .map((v) => {
          const date = parseDay(v.dueDate);
          return {
            key: `vax-${v.pet.id}-${v.id}`,
            date,
            title: v.name,
            sub: `${v.pet.name} · ${fmtDay(date)}`,
            pet: v.pet,
            dueSoon: v.status === 'due_soon',
            onPress: () => navigation.navigate('VaccinationTracker', { petId: v.pet.id }),
          };
        }),
      ...(filter === 'all'
        ? reminders
            .filter((r) => r.next_fire_at || r.fire_at)
            .map((r) => {
              const pet = petById(pets, r.pet_id) || null;
              const kind =
                r.schedule_type === 'recurring'
                  ? `${(r.recurrence || 'daily').replace(/^\w/, (c) => c.toUpperCase())} reminder`
                  : 'Reminder';
              return {
                key: `rem-${r.id}`,
                date: new Date(r.next_fire_at || r.fire_at),
                title: r.title,
                sub: pet ? `${pet.name} · ${kind}` : kind,
                pet,
                icon: 'bell-outline',
                // Backend reminders are delivered as local notifications on
                // this device — the row can honestly state when. Vaccination
                // rows never get this flag (their reminders are backend-created).
                isReminder: true,
                recurring: r.schedule_type === 'recurring',
                onPress: () => navigation.navigate('Reminders'),
              };
            })
        : []),
    ]
      .filter((item) => !Number.isNaN(item.date.getTime()))
      // A one-off reminder is a moment: once it has fired (even earlier
      // today) it's history. A recurring one stays — DataContext refetches
      // its next occurrence shortly after it fires.
      .filter((item) => !item.isReminder || item.recurring || item.date >= now)
      .sort((a, b) => a.date - b.date);

    const todayItems = [...overdueItems, ...upcoming.filter((i) => dayDiff(i.date, today) <= 0)];
    const week = upcoming.filter((i) => dayDiff(i.date, today) > 0 && dayDiff(i.date, today) <= 7);
    const later = upcoming.filter((i) => dayDiff(i.date, today) > 7);

    const done = vax
      .filter((v) => v.status === 'completed')
      .sort((a, b) => (b.administeredDate || b.dueDate || '').localeCompare(a.administeredDate || a.dueDate || ''));

    return {
      sections: [
        { label: 'Today', items: todayItems },
        { label: 'This week', items: week },
        { label: 'Later', items: later },
      ].filter((sec) => sec.items.length > 0),
      history: done,
    };
  }, [shownPets, pets, reminders, filter, navigation, today, reminderTick]);

  // The "Scheduled on this device" caption sits on the first section holding
  // a reminder, and stays hidden when there are none (findIndex → -1).
  const firstReminderSectionIdx = sections.findIndex((sec) =>
    sec.items.some((it) => it.isReminder)
  );

  // The vault opens one pet's records: the filtered pet, or the only pet.
  const vaultPet = filter !== 'all' ? shownPets[0] : pets.length === 1 ? pets[0] : null;
  const VaultCard = vaultPet ? Pressable : View;
  const openVault = (pet) =>
    navigation.navigate('MedicalRecords', { petId: pet.id, petName: pet.name });

  const openSheet = () => {
    if (!pets.length) {
      showToast('Add a pet first');
      return;
    }
    setRecType('Vaccine');
    setRecPetId(filter !== 'all' ? filter : pets[0].id);
    setRecName('');
    setRecDate(defaultDueDate());
    setSheetOpen(true);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) setRecDate(selectedDate);
  };

  // One record per tap: the in-flight guard is a ref, so two taps in one
  // frame can't both save. A failed save keeps the sheet (and what was
  // typed) open for a retry instead of claiming success.
  const saveVaccine = () => {
    if (!recName.trim() || !recPet) return undefined;
    return run('record', async () => {
      const saved = await addVaccination(recPet.id, {
        name: recName.trim(),
        dueDate: recDate.toISOString().split('T')[0],
        status: 'upcoming',
        administeredDate: null,
      });
      if (!saved) {
        showToast("Couldn't save the record. Try again.");
        return;
      }
      setSheetOpen(false);
      showToast('Record saved');
    });
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

  const { run, isBusy } = useInFlight();
  const markDone = (v) =>
    run(v.id, async () => {
      const saved = await markVaccinationComplete(v.pet.id, v.id);
      if (saved) showToast(`${v.name} marked done`, { celebrate: true, actionType: 'vaccination_done' });
      else showToast(`Couldn't mark ${v.name} done. Try again.`);
    });

  const renderRow = (item, i, items) => {
    const last = i === items.length - 1;
    const v = item.overdueVax;
    return (
      <Animated.View key={item.key} exiting={ROW_OUT} layout={ROW_LAYOUT}>
        <Pressable
          onPress={item.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.row,
            !last && styles.rowDivider,
            pressed && { backgroundColor: ui.pressTint },
          ]}
        >
          {item.pet ? (
            <PetFace pet={item.pet} />
          ) : (
            <View style={styles.iconPuck}>
              <MaterialCommunityIcons name={item.icon || 'bell-outline'} size={18} color={ui.accent} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{item.sub}</Text>
            {v ? (
              <StatusPill
                status="overdue"
                label={overdueLabel(v.dueDate, today)}
                style={{ marginTop: 6 }}
              />
            ) : item.dueSoon ? (
              <StatusPill status="due" label={`Due ${relativeDay(item.date, today)}`} style={{ marginTop: 6 }} />
            ) : null}
            {item.isReminder && remindersPrefOn !== null && (
              remindersPrefOn ? (
                <View style={[styles.deliveryPill, { backgroundColor: ui.successTint }]}>
                  <MaterialCommunityIcons name="bell-check-outline" size={11} color={ui.success} />
                  <Text style={[styles.deliveryPillText, { color: ui.success }]}>
                    Scheduled · {fmtDelivery(item.date)}
                  </Text>
                </View>
              ) : (
                // Honest state: local scheduling is off, so no notification
                // will fire — never fake reassurance.
                <View style={[styles.deliveryPill, { backgroundColor: ui.track }]}>
                  <MaterialCommunityIcons name="bell-off-outline" size={11} color={ui.subtle} />
                  <Text style={[styles.deliveryPillText, { color: ui.subtle }]}>
                    Notifications off
                  </Text>
                </View>
              )
            )}
          </View>
          {v ? (
            <Button small variant="soft" icon="check" label="Done" disabled={isBusy(v.id)} onPress={() => markDone(v)} />
          ) : item.dueSoon ? (
            <MaterialCommunityIcons name="chevron-right" size={20} color={ui.faint} />
          ) : (
            <Text style={styles.rowWhen}>{relativeDay(item.date, today)}</Text>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={[type.screenTitle, { color: ui.ink }]}>Health</Text>
          {lastSyncedAt != null && (
            <View style={styles.syncRow}>
              <MaterialCommunityIcons name="cloud-check" size={13} color={ui.ringOk} />
              <Text style={styles.syncText}>{syncedLabel(lastSyncedAt)}</Text>
            </View>
          )}
        </View>

        {pets.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <Chip
              accessibilityRole="radio"
              label="All"
              active={filter === 'all'}
              onPress={() => setFilter('all')}
              style={styles.allChip}
            />
            {pets.map((p) => (
              <PetFilterChip
                key={p.id}
                pet={p}
                active={filter === p.id}
                onPress={() => setFilter(p.id)}
              />
            ))}
          </ScrollView>
        )}

        {sections.length === 0 ? (
          pets.length ? (
            <EmptyState
              photo={photos.emptyBlanket}
              title="All quiet on the health front"
              body={`Nothing scheduled${filter !== 'all' && shownPets[0] ? ` for ${shownPets[0].name}` : ''}. Add a vaccine or vet visit and we'll nudge you before it's due.`}
              style={styles.empty}
            />
          ) : (
            <EmptyState
              photo={photos.emptyBlanket}
              title="No pets yet"
              body="Add your first pet and their vaccines, meds and vet visits will line up here."
              actionLabel="Add a pet"
              actionIcon="plus"
              onAction={() => navigation.navigate('Pets', { screen: 'AddPet' })}
              style={styles.empty}
            />
          )
        ) : (
          sections.map((sec, si) => (
            <View key={sec.label}>
              <View style={styles.sectionHeadRow}>
                <Text style={[type.sectionLabel, { color: ui.subtle }]}>{sec.label}</Text>
                {si === firstReminderSectionIdx && remindersPrefOn === true && (
                  <View style={styles.deviceCaption}>
                    <MaterialCommunityIcons name="cellphone-check" size={12} color={ui.sub} />
                    <Text style={styles.deviceCaptionText}>Scheduled on this device</Text>
                  </View>
                )}
              </View>
              <Card style={styles.sectionCard}>
                {sec.items.map((item, i) => renderRow(item, i, sec.items))}
              </Card>
            </View>
          ))
        )}

        {pets.length > 0 && (
          // One pet in view: the whole card opens its vault. Several: a plain
          // card whose pet faces are the buttons — never a disabled button
          // wrapping live ones (screen readers would announce them disabled).
          <VaultCard
            {...(vaultPet
              ? {
                  onPress: () => openVault(vaultPet),
                  accessibilityRole: 'button',
                  style: ({ pressed }) => [styles.vault, pressed && { opacity: motion.pressOpacitySoft }],
                }
              : { style: styles.vault })}
          >
            <View style={styles.vaultIcon}>
              <MaterialCommunityIcons name="shield-check" size={22} color={VAULT.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vaultTitle}>
                {vaultPet ? `${vaultPet.name}'s medical vault` : 'Medical vault'}
              </Text>
              <Text style={styles.vaultSub}>
                {vaultPet ? 'Vet records, lab results & documents' : 'Pick a pet to open their records'}
              </Text>
              {!vaultPet && (
              <View style={styles.vaultFaces}>
                {pets.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => openVault(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}'s medical vault`}
                    hitSlop={6}
                    style={({ pressed }) => pressed && { opacity: motion.pressOpacity }}
                  >
                    <PetFace pet={p} size={30} />
                  </Pressable>
                ))}
              </View>
              )}
            </View>
            {vaultPet && <MaterialCommunityIcons name="chevron-right" size={22} color={VAULT.fg} />}
          </VaultCard>
        )}

        {history.length > 0 && (
          <>
            <Text style={[type.sectionLabel, styles.sectionLabel, { color: ui.subtle }]}>
              History
            </Text>
            <Card style={styles.sectionCard}>
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
                    {fmtShort(parseDay(v.administeredDate || v.dueDate))}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      {/* The screen's one primary action floats in the thumb zone. */}
      {pets.length > 0 && (
        <Button pill icon="plus" label="Add record" onPress={openSheet} style={styles.fab} />
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="New record">
        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>Type</Text>
          <View style={styles.chipWrap}>
            {RECORD_TYPES.map((t) => (
              <Chip accessibilityRole="radio" key={t} label={t} active={recType === t} onPress={() => setRecType(t)} />
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.petChip, on && styles.petChipOn]}
                >
                  <PetFace pet={p} size={24} ring={false} />
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
              disabled={!recName.trim() || isBusy('record')}
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
  // Bottom room so the floating "Add record" never covers the last row.
  scroll: { paddingBottom: 104 },
  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  syncText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11.5, color: ui.subtle },
  filters: { gap: 8, paddingHorizontal: 24, paddingBottom: 20, alignItems: 'center' },
  allChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  faceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
  faceChipOn: { backgroundColor: ui.selectedTint, borderColor: ui.accent },
  faceChipLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13.5, color: ui.ink },
  sectionLabel: { marginHorizontal: 24, marginBottom: 10, marginTop: 6 },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 24,
    marginTop: 6,
    marginBottom: 10,
  },
  // Shown once (beside the first section with a reminder) so each reminder
  // row doesn't repeat "· this device" — the pills just say "Scheduled · <when>".
  deviceCaption: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // ui.sub (body-secondary) rather than ui.subtle — the smaller caption needs
  // the extra contrast to clear WCAG AA at this size.
  deviceCaptionText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    color: ui.sub,
  },
  sectionCard: { marginHorizontal: 24, marginBottom: 18 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 64,
  },
  iconPuck: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: ui.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { ...type.rowTitle, fontSize: 15, lineHeight: 20, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  rowWhen: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: ui.sub },
  deliveryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    marginTop: 5,
  },
  deliveryPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10.5 },
  vault: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    marginBottom: 22,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    borderCurve: 'continuous',
    backgroundColor: VAULT.bg,
  },
  vaultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.ink },
  vaultSub: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: VAULT.fg, marginTop: 1 },
  vaultFaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
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
  empty: { marginHorizontal: 24, marginTop: 12, marginBottom: 28 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    minHeight: 52,
    paddingHorizontal: 22,
    boxShadow: elevation.card,
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
  petChipOn: { backgroundColor: ui.selectedTint, borderColor: ui.accent },
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
