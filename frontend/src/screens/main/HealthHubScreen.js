import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { getPref } from '../../services/prefs';
import { fmtShort, fmtDay, fmtDate, fmtClock, fmtWeekday, dayDiff, overdueLabel, parseDay, relativeDay } from '../../utils/dates';
import i18n, { useLocale, useTranslation } from '../../i18n';
import { petById } from '../../utils/pets';
import { reminderKind } from '../../utils/reminders';
import { useToday } from '../../hooks/useToday';
import { useInFlight } from '../../hooks/useInFlight';
import { useNotificationsPrompt } from '../../hooks/useNotificationsPrompt';
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
// No `layout` transition on rows (CHW-236): on Android a row's layout
// animation could stall mid-way when a row was inserted while its Card grew,
// leaving two rows drawn on top of each other until the screen remounted.
// Rows still fade out on delete; the others simply settle into place.


const VAULT = vaultColors;

// "Synced just now" / "Synced 5m ago" / "Synced 2h ago" — quiet trust line.
const syncedLabel = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60000) return i18n.t('health.synced.justNow');
  if (diff < 3600000) return i18n.t('health.synced.minutes', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return i18n.t('health.synced.hours', { n: Math.floor(diff / 3600000) });
  return i18n.t('health.synced.days', { n: Math.floor(diff / 86400000) });
};

// "Tue 9:00 AM" — when the local notification for a reminder will fire.
const fmtDelivery = (date) => `${fmtWeekday(date)} ${fmtClock(date)}`;

// Record type ids; their labels live under health.types.
const RECORD_TYPES = ['vaccine', 'vetVisit', 'medication', 'weight'];

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
  // The app language: tabs stay mounted, so a language switch must re-render
  // (and re-run the memos below that build date strings).
  const locale = useLocale();
  const { t } = useTranslation();
  const { pets, reminders, lastSyncedAt, addVaccination, markVaccinationComplete, takeFailureNote } = useData();

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
  const [recType, setRecType] = useState('vaccine');
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

  // The reminders Health lists: switched-on ones, minus a vaccination's own
  // due-date reminder (the vaccination already has its row — status shows
  // once). A switched-off one-off keeps its fire_at, which would otherwise
  // surface it as still scheduled.
  const listedReminders = useMemo(
    () => reminders.filter((r) => r.enabled && r.type !== 'vaccination'),
    [reminders],
  );

  // Re-run the grouping when the next reminder fires, so a Health tab left
  // open drops it from Today on time (this tab stays mounted).
  const reminderTimes = useMemo(
    () => listedReminders.map((r) => new Date(r.next_fire_at || r.fire_at).getTime()).filter(Number.isFinite),
    [listedReminders],
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
          sub: t('health.wasDue', { pet: v.pet.name, date: fmtDay(date) }),
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
        ? listedReminders
            .filter((r) => r.next_fire_at || r.fire_at)
            .map((r) => {
              const pet = petById(pets, r.pet_id) || null;
              const kind = reminderKind(r);
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
        { id: 'today', label: t('health.sections.today'), items: todayItems },
        { id: 'week', label: t('health.sections.week'), items: week },
        { id: 'later', label: t('health.sections.later'), items: later },
      ].filter((sec) => sec.items.length > 0),
      history: done,
    };
  }, [shownPets, pets, listedReminders, filter, navigation, today, reminderTick, locale, t]);

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
      showToast(t('health.toast.addPetFirst'));
      return;
    }
    setRecType('vaccine');
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
        showToast(takeFailureNote() || t('health.toast.saveFailed'));
        return;
      }
      setSheetOpen(false);
      showToast(t('health.toast.saved'));
      maybeAsk(); // a vaccine reminder was just set up (CHW-230)
    });
  };

  const continueElsewhere = () => {
    if (!recPet) return;
    setSheetOpen(false);
    if (recType === 'vetVisit') {
      navigation.navigate('MedicalRecords', { petId: recPet.id, petName: recPet.name });
    } else {
      navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: recPet.id } });
    }
  };

  const { run, isBusy } = useInFlight();
  const { maybeAsk, prompt: notificationsPrompt } = useNotificationsPrompt();
  const markDone = (v) =>
    run(v.id, async () => {
      const saved = await markVaccinationComplete(v.pet.id, v.id);
      if (saved) showToast(t('health.toast.vaccineDone', { name: v.name }), { celebrate: true, actionType: 'vaccination_done' });
      else showToast(t('health.toast.vaccineFailed', { name: v.name }));
    });

  const renderRow = (item, i, items) => {
    const last = i === items.length - 1;
    const v = item.overdueVax;
    return (
      <Animated.View key={item.key} exiting={ROW_OUT}>
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
              <StatusPill status="due" label={t('health.dueWhen', { when: relativeDay(item.date, today) })} style={{ marginTop: 6 }} />
            ) : null}
            {item.isReminder && remindersPrefOn !== null && (
              remindersPrefOn ? (
                <View style={[styles.deliveryPill, { backgroundColor: ui.successTint }]}>
                  <MaterialCommunityIcons name="bell-check-outline" size={11} color={ui.success} />
                  <Text style={[styles.deliveryPillText, { color: ui.success }]}>
                    {t('health.scheduledAt', { time: fmtDelivery(item.date) })}
                  </Text>
                </View>
              ) : (
                // Honest state: local scheduling is off, so no notification
                // will fire — never fake reassurance.
                <View style={[styles.deliveryPill, { backgroundColor: ui.track }]}>
                  {/* sub, not subtle: subtle on track is under 4.5:1 */}
                  <MaterialCommunityIcons name="bell-off-outline" size={11} color={ui.sub} />
                  <Text style={[styles.deliveryPillText, { color: ui.sub }]}>
                    {t('health.notificationsOff')}
                  </Text>
                </View>
              )
            )}
          </View>
          {v ? (
            <Button small variant="soft" icon="check" label={t('health.done')} disabled={isBusy(v.id)} onPress={() => markDone(v)} />
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
          <Text style={[type.screenTitle, { color: ui.ink }]}>{t('health.title')}</Text>
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
              label={t('health.filterAll')}
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
              title={t('health.empty.title')}
              body={filter !== 'all' && shownPets[0]
                ? t('health.empty.bodyPet', { name: shownPets[0].name })
                : t('health.empty.body')}
              style={styles.empty}
            />
          ) : (
            <EmptyState
              photo={photos.emptyBlanket}
              title={t('health.noPets.title')}
              body={t('health.noPets.body')}
              actionLabel={t('health.noPets.action')}
              actionIcon="plus"
              onAction={() => navigation.navigate('Pets', { screen: 'AddPet' })}
              style={styles.empty}
            />
          )
        ) : (
          sections.map((sec, si) => (
            <View key={sec.id}>
              <View style={styles.sectionHeadRow}>
                <Text style={[type.sectionLabel, { color: ui.subtle }]}>{sec.label}</Text>
                {si === firstReminderSectionIdx && remindersPrefOn === true && (
                  <View style={styles.deviceCaption}>
                    <MaterialCommunityIcons name="cellphone-check" size={12} color={ui.sub} />
                    <Text style={styles.deviceCaptionText}>{t('health.scheduledOnDevice')}</Text>
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
                {vaultPet ? t('health.vault.petTitle', { name: vaultPet.name }) : t('health.vault.title')}
              </Text>
              <Text style={styles.vaultSub}>
                {vaultPet ? t('health.vault.subtitle') : t('health.vault.pickPet')}
              </Text>
              {!vaultPet && (
              <View style={styles.vaultFaces}>
                {pets.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => openVault(p)}
                    accessibilityRole="button"
                    accessibilityLabel={t('health.vault.petTitle', { name: p.name })}
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
              {t('health.history')}
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
        <Button pill icon="plus" label={t('health.addRecord')} onPress={openSheet} style={styles.fab} />
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t('health.sheet.title')}>
        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>{t('health.sheet.type')}</Text>
          <View style={styles.chipWrap}>
            {RECORD_TYPES.map((id) => (
              <Chip accessibilityRole="radio" key={id} label={t(`health.types.${id}`)} active={recType === id} onPress={() => setRecType(id)} />
            ))}
          </View>
        </View>

        <View>
          <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>{t('health.sheet.pet')}</Text>
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

        {recType === 'vaccine' ? (
          <>
            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel, { color: ui.subtle }]}>{t('health.sheet.name')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('health.sheet.namePlaceholder')}
                placeholderTextColor={ui.placeholder}
                value={recName}
                onChangeText={setRecName}
              />
            </View>
            <Pressable accessibilityRole="button" style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={ui.accent} />
              <Text style={styles.dateText}>
                {t('health.sheet.dueDate', { date: fmtDate(recDate, { weekday: 'short', month: 'short', day: 'numeric' }) })}
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
              label={t('health.sheet.saveOn', { date: fmtShort(recDate) })}
              onPress={saveVaccine}
              disabled={!recName.trim() || isBusy('record')}
            />
          </>
        ) : (
          <>
            <Text style={styles.redirectHint}>
              {recType === 'vetVisit'
                ? t('health.sheet.vetVisitHint', { name: recPet?.name ?? t('health.sheet.thePet') })
                : recType === 'medication'
                  ? t('health.sheet.medicationHint', { name: recPet?.name ?? t('health.sheet.thePet') })
                  : t('health.sheet.weightHint', { name: recPet?.name ?? t('health.sheet.thePet') })}
            </Text>
            <Button label={t('health.sheet.continue')} onPress={continueElsewhere} />
          </>
        )}
      </Sheet>
      {notificationsPrompt}
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
    borderColor: ui.inputBorder,
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
