import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { usePetRecords } from '../../hooks/usePetRecords';
import { ui, radii, type, motion, photos } from '../../theme';
import { Card, Button, ConfirmDialog, EmptyState, PetFace, showToast, ScreenHeader, reminderIcon, Toggle, DeleteButton, NotificationsBanner } from '../../components';
import { useInFlight } from '../../hooks/useInFlight';
import { useNotificationsPrompt } from '../../hooks/useNotificationsPrompt';
import { petById } from '../../utils/pets';
import { fmtDate } from '../../utils/dates';
import { recurringSummary } from '../../utils/reminders';
import i18n, { useLocale, useTranslation } from '../../i18n';
import { EASE_OUT_CSS } from '../../components/motion';

const ROW_OUT = FadeOut.duration(150);
// No `layout` transition on rows (CHW-236): on Android a row's layout
// animation could stall mid-way when a row was inserted while its Card grew,
// leaving two rows drawn on top of each other until the screen remounted.
// Rows still fade out on delete; the others simply settle into place.

function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatWhen(iso) {
  if (!iso) return '—';
  return fmtDate(new Date(iso), {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) || '—';
}

// "Weekly at 9:00 AM" for a recurring reminder (utils/reminders), else its next date.
function scheduleSummary(r) {
  if (r.schedule_type === 'recurring') return recurringSummary(r);
  return r.next_fire_at ? formatWhen(r.next_fire_at) : i18n.t('reminders.schedule.oneTime');
}

export default function RemindersScreen({ navigation }) {
  // Re-render dates and times when the app language changes: this screen
  // can stay mounted under another tab while the language is switched.
  useLocale();
  const { t } = useTranslation();
  const { reminders, addReminder, updateReminder, deleteReminder } = useData();
  const pets = usePetRecords();
  // A reminder tied to a pet shows that pet's face — recognised before read.
  const petOf = (r) => petById(pets, r.pet_id) || null;

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(defaultWhen());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const canSave = title.trim().length > 0 && when.getTime() > Date.now();

  // One reminder per tap (a ref guard — state alone lets two taps in one
  // frame through); the form clears only once it's saved.
  const { run, isBusy } = useInFlight();
  const saving = isBusy('add');
  // A reminder was just asked for: the moment to offer notifications (CHW-230).
  const { maybeAsk, prompt: notificationsPrompt } = useNotificationsPrompt();
  const onSave = () => {
    if (!canSave) return undefined;
    return run('add', async () => {
      const saved = await addReminder({
        title: title.trim(),
        schedule_type: 'one_time',
        fire_at: when.toISOString(),
        lead_time_days: 0,
      });
      if (!saved) {
        showToast(t('reminders.toast.addFailed'));
        return;
      }
      setTitle('');
      setWhen(defaultWhen());
      showToast(t('reminders.toast.added'));
      maybeAsk();
    });
  };

  const confirmDelete = () => {
    const r = pendingDelete;
    setPendingDelete(null);
    if (!r) return;
    deleteReminder(r.id).then((ok) =>
      showToast(ok ? t('reminders.toast.deleted') : t('reminders.toast.deleteFailed')));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('reminders.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <NotificationsBanner style={styles.banner} />

        {/* Add custom reminder */}
        <Card padded style={styles.formCard}>
          <Text style={styles.formLabel}>{t('reminders.form.title')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('reminders.form.placeholder')}
            placeholderTextColor={ui.placeholder}
            value={title}
            onChangeText={(v) => setTitle(v.replace(/\n/g, ' '))}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
          />
          <Pressable accessibilityRole="button"
            style={({ pressed }) => [styles.whenRow, pressed && { backgroundColor: ui.surface }]}
            onPress={() => setShowDate(true)}
          >
            <MaterialCommunityIcons name="calendar-clock" size={17} color={ui.accent} />
            <Text style={styles.whenText}>{formatWhen(when.toISOString())}</Text>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={ui.faint} />
          </Pressable>
          <Button
            label={t('reminders.form.add')}
            icon="bell-plus-outline"
            onPress={onSave}
            disabled={!canSave || saving}
          />
        </Card>

        {showDate && (
          <DateTimePicker
            value={when}
            mode="date"
            minimumDate={new Date()}
            onChange={(e, d) => {
              setShowDate(false);
              if (e.type === 'set' && d) {
                const nd = new Date(when);
                nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setWhen(nd);
                setShowTime(true);
              }
            }}
          />
        )}
        {showTime && (
          <DateTimePicker
            value={when}
            mode="time"
            onChange={(e, d) => {
              setShowTime(false);
              if (e.type === 'set' && d) {
                const nd = new Date(when);
                nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
                setWhen(nd);
              }
            }}
          />
        )}

        {/* Existing reminders */}
        <Text style={styles.sectionLabel}>{t('reminders.listTitle')}</Text>
        {reminders.length === 0 ? (
          <EmptyState
            compact
            photo={photos.emptyKitten}
            title={t('reminders.empty.title')}
            body={t('reminders.empty.body')}
            style={{ marginTop: 8 }}
          />
        ) : (
          <Card>
            {reminders.map((r, i) => {
              const pet = petOf(r);
              return (
              <Animated.View
                key={r.id}
                exiting={ROW_OUT}
                style={[styles.reminderRow, i > 0 && styles.rowDivider]}
              >
                {pet ? (
                  <Animated.View style={[{ opacity: r.enabled ? 1 : 0.4 }, styles.toggleFade]}>
                    <PetFace pet={pet} size={30} />
                  </Animated.View>
                ) : (
                  <Animated.View style={[styles.rIcon, { opacity: r.enabled ? 1 : 0.4 }, styles.toggleFade]}>
                    <MaterialCommunityIcons name={reminderIcon(r.type)} size={18} color={ui.sub} />
                  </Animated.View>
                )}
                <View style={{ flex: 1 }}>
                  <Animated.Text
                    style={[styles.rTitle, !r.enabled && styles.rTitleOff, styles.toggleFade]}
                    numberOfLines={1}
                  >
                    {r.title}
                  </Animated.Text>
                  <Text style={styles.rSummary}>
                    {pet ? t('reminders.petSummary', { pet: pet.name, schedule: scheduleSummary(r) }) : scheduleSummary(r)}
                  </Text>
                </View>
                <Toggle
                  value={!!r.enabled}
                  onValueChange={(v) => updateReminder(r.id, { enabled: v })}
                  accessibilityLabel={t('reminders.toggleA11y', { title: r.title })}
                />
                <DeleteButton label={t('reminders.deleteA11y', { title: r.title })} onPress={() => setPendingDelete(r)} style={styles.delBtn} />
              </Animated.View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDelete}
        title={t('reminders.confirmDelete.title')}
        message={pendingDelete ? t('reminders.confirmDelete.message', { title: pendingDelete.title }) : ''}
        confirmLabel={t('reminders.confirmDelete.confirm')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {notificationsPrompt}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
  formCard: { gap: 12 },
  banner: { marginBottom: 16 },
  formLabel: { ...type.sectionLabel, color: ui.subtle },
  input: {
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    padding: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    padding: 14,
  },
  whenText: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13.5, color: ui.ink },
  sectionLabel: { ...type.sectionLabel, color: ui.subtle, marginTop: 24, marginBottom: 10 },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.hairline },
  rIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.track,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rTitle: { ...type.rowTitle, color: ui.ink },
  rTitleOff: { color: ui.sub, textDecorationLine: 'line-through' },
  // Toggling a reminder crossfades the puck + title instead of snapping.
  toggleFade: {
    transitionProperty: ['opacity', 'color'],
    transitionDuration: motion.duration.control,
    transitionTimingFunction: EASE_OUT_CSS,
  },
  rSummary: { ...type.secondary, color: ui.sub, marginTop: 1 },
  delBtn: { marginLeft: 4 },
});
