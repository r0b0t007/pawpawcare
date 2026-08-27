import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { ui, radii, type, motion } from '../../theme';
import { Card, Button, ConfirmDialog, showToast } from '../../components';
import { EASE_OUT_CSS } from '../../components/motion';

const ROW_OUT = FadeOut.duration(150);
const ROW_LAYOUT = LinearTransition.duration(200);

const TYPE_ICON = {
  vaccination: 'needle',
  medication: 'pill',
  activity: 'run',
  custom: 'bell-ring-outline',
};

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
  const { reminders, addReminder, updateReminder, deleteReminder } = useData();

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(defaultWhen());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const canSave = title.trim().length > 0 && when.getTime() > Date.now();

  const onSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await addReminder({
      title: title.trim(),
      schedule_type: 'one_time',
      fire_at: when.toISOString(),
      lead_time_days: 0,
    });
    setTitle('');
    setWhen(defaultWhen());
    setSaving(false);
    showToast('Reminder added');
  };

  const confirmDelete = () => {
    const r = pendingDelete;
    setPendingDelete(null);
    if (!r) return;
    deleteReminder(r.id);
    showToast('Reminder deleted');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Reminders</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Add custom reminder */}
        <Card padded style={styles.formCard}>
          <Text style={styles.formLabel}>New reminder</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Give Rex his heartworm pill"
            placeholderTextColor={ui.subtle}
            value={title}
            onChangeText={setTitle}
          />
          <Pressable
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
          <Text style={styles.emptyText}>No reminders yet. Vaccination reminders are added automatically.</Text>
        ) : (
          <Card>
            {reminders.map((r, i) => (
              <Animated.View
                key={r.id}
                exiting={ROW_OUT}
                layout={ROW_LAYOUT}
                style={[styles.reminderRow, i > 0 && styles.rowDivider]}
              >
                <Animated.View style={[styles.rIcon, { opacity: r.enabled ? 1 : 0.4 }, styles.toggleFade]}>
                  <MaterialCommunityIcons name={TYPE_ICON[r.type] || 'bell-outline'} size={18} color={ui.accent} />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Animated.Text
                    style={[styles.rTitle, !r.enabled && styles.rTitleOff, styles.toggleFade]}
                    numberOfLines={1}
                  >
                    {r.title}
                  </Animated.Text>
                  <Text style={styles.rSummary}>{scheduleSummary(r)}</Text>
                </View>
                <Switch
                  value={!!r.enabled}
                  onValueChange={(v) => updateReminder(r.id, { enabled: v })}
                  trackColor={{ true: ui.accentTint, false: ui.track }}
                  thumbColor={r.enabled ? ui.accent : ui.faint}
                />
                <Pressable
                  onPress={() => setPendingDelete(r)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [styles.delBtn, pressed && { opacity: motion.pressOpacity }]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={ui.danger} />
                </Pressable>
              </Animated.View>
            ))}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
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
  title: { ...type.screenTitle, flex: 1, color: ui.ink },
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
  emptyText: { ...type.body, color: ui.sub },
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
    backgroundColor: ui.accentTint,
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
  delBtn: { padding: 4 },
});
