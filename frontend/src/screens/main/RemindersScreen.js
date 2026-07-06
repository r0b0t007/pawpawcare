import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

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
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onBackground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reminders</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Add custom reminder */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New reminder</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Give Rex his heartworm pill"
            placeholderTextColor={colors.outline}
            value={title}
            onChangeText={setTitle}
          />
          <TouchableOpacity style={styles.whenRow} onPress={() => setShowDate(true)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="calendar-clock" size={18} color={colors.primaryContainer} />
            <Text style={styles.whenText}>{formatWhen(when.toISOString())}</Text>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.outline} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={onSave}
            activeOpacity={0.88}
            disabled={!canSave}
          >
            <MaterialCommunityIcons name="bell-plus-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.saveBtnText}>Add reminder</Text>
          </TouchableOpacity>
        </View>

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
        <Text style={styles.sectionTitle}>Your reminders</Text>
        {reminders.length === 0 ? (
          <Text style={styles.emptyText}>No reminders yet. Vaccination reminders are added automatically.</Text>
        ) : (
          reminders.map((r) => (
            <View key={r.id} style={styles.reminderRow}>
              <View style={[styles.rIcon, { opacity: r.enabled ? 1 : 0.4 }]}>
                <MaterialCommunityIcons name={TYPE_ICON[r.type] || 'bell-outline'} size={20} color={colors.primaryContainer} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rTitle, !r.enabled && styles.rTitleOff]} numberOfLines={1}>{r.title}</Text>
                <Text style={styles.rSummary}>{scheduleSummary(r)}</Text>
              </View>
              <Switch
                value={!!r.enabled}
                onValueChange={(v) => updateReminder(r.id, { enabled: v })}
                trackColor={{ true: colors.primaryFixedDim, false: colors.surfaceContainerHighest }}
                thumbColor={r.enabled ? colors.primaryContainer : colors.outline}
              />
              <TouchableOpacity
                onPress={() => deleteReminder(r.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.delBtn}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { ...typography.titleLg, color: colors.onBackground },
  scroll: { paddingHorizontal: spacing.margin, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.md,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.labelMd, color: colors.onSurfaceVariant },
  input: {
    ...typography.bodyMd,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  whenText: { ...typography.labelMd, color: colors.onSurface, flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryContainer,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    ...shadows.button,
  },
  saveBtnDisabled: { backgroundColor: colors.outlineVariant, shadowOpacity: 0, elevation: 0 },
  saveBtnText: { ...typography.labelMd, color: colors.onPrimary },
  sectionTitle: { ...typography.titleLg, color: colors.onBackground, marginTop: spacing.md, marginBottom: spacing.sm },
  emptyText: { ...typography.bodyMd, fontSize: 14, color: colors.onSurfaceVariant },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  rIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rTitle: { ...typography.labelMd, color: colors.onSurface },
  rTitleOff: { color: colors.onSurfaceVariant, textDecorationLine: 'line-through' },
  rSummary: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 2 },
  delBtn: { padding: spacing.xs },
});
