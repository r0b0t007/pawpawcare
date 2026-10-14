import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { ui, radii, type, motion, photos } from '../../theme';
import { Card, Button, ConfirmDialog, EmptyState, PetFace, showToast, ScreenHeader, reminderIcon, Toggle, DeleteButton } from '../../components';
import { useInFlight } from '../../hooks/useInFlight';
import { petById } from '../../utils/pets';
import { EASE_OUT_CSS } from '../../components/motion';

const ROW_OUT = FadeOut.duration(150);
const ROW_LAYOUT = LinearTransition.duration(200);

function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function scheduleSummary(r) {
  if (r.schedule_type === 'recurring') {
    const freq = (r.recurrence || 'daily').replace(/^\w/, (c) => c.toUpperCase());
    return `${freq} at ${r.time_of_day || '09:00'}`;
  }
  return r.next_fire_at ? formatWhen(r.next_fire_at) : 'One-time';
}

export default function RemindersScreen({ navigation }) {
  const { reminders, pets, addReminder, updateReminder, deleteReminder } = useData();
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
        showToast("Couldn't add the reminder. Try again.");
        return;
      }
      setTitle('');
      setWhen(defaultWhen());
      showToast('Reminder added');
    });
  };

  const confirmDelete = () => {
    const r = pendingDelete;
    setPendingDelete(null);
    if (!r) return;
    deleteReminder(r.id).then((ok) =>
      showToast(ok ? 'Reminder deleted' : "Couldn't delete the reminder. Try again."));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Reminders" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Add custom reminder */}
        <Card padded style={styles.formCard}>
          <Text style={styles.formLabel}>New reminder</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Give Rex his heartworm pill"
            placeholderTextColor={ui.placeholder}
            value={title}
            onChangeText={setTitle}
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
            label="Add reminder"
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
        <Text style={styles.sectionLabel}>Your reminders</Text>
        {reminders.length === 0 ? (
          <EmptyState
            compact
            photo={photos.emptyKitten}
            title="No reminders yet"
            body="Vaccination reminders are added automatically. Add your own above for anything else."
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
                layout={ROW_LAYOUT}
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
                    {pet ? `${pet.name} · ` : ''}{scheduleSummary(r)}
                  </Text>
                </View>
                <Toggle
                  value={!!r.enabled}
                  onValueChange={(v) => updateReminder(r.id, { enabled: v })}
                  accessibilityLabel={`${r.title} reminder`}
                />
                <DeleteButton label={`Delete ${r.title}`} onPress={() => setPendingDelete(r)} style={styles.delBtn} />
              </Animated.View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete reminder?"
        message={pendingDelete ? `"${pendingDelete.title}" will no longer fire. This can't be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
  formCard: { gap: 12 },
  formLabel: { ...type.sectionLabel, color: ui.subtle },
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
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
    borderColor: ui.controlBorder,
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
