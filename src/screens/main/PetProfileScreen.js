import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const ACTIVITY_ICONS = ['tree', 'tennis-ball', 'school', 'cat', 'sleep', 'run', 'swimming', 'bike', 'dog-side', 'toy-brick'];

export default function PetProfileScreen({ navigation, route }) {
  const { petId } = route.params;
  const { pets, addFavoriteFood, removeFavoriteFood, addActivity } = useData();
  const pet = pets.find((p) => p.id === petId);

  const [foodModal, setFoodModal] = useState(false);
  const [activityModal, setActivityModal] = useState(false);
  const [newFood, setNewFood] = useState('');
  const [newActivity, setNewActivity] = useState({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={styles.empty}>Pet not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleAddFood = async () => {
    if (!newFood.trim()) return;
    await addFavoriteFood(petId, newFood.trim());
    setNewFood('');
    setFoodModal(false);
  };

  const handleAddActivity = async () => {
    if (!newActivity.name.trim()) return;
    await addActivity(petId, {
      name: newActivity.name.trim(),
      duration: parseInt(newActivity.duration) || 30,
      timeOfDay: newActivity.timeOfDay,
      icon: newActivity.icon,
    });
    setNewActivity({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });
    setActivityModal(false);
  };

  const upcoming = (pet.vaccinations || []).filter((v) => v.status !== 'completed');
  const nextVax = upcoming[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Back + Edit */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('AddPet', { petId })}
          >
            <MaterialCommunityIcons name="pencil" size={18} color={colors.primaryContainer} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroAvatar, { backgroundColor: pet.color || colors.primaryFixed }]}>
            <Text style={styles.heroAvatarText}>{pet.name[0]}</Text>
            {pet.gender && (
              <View style={[styles.genderBadge, { backgroundColor: pet.gender === 'female' ? '#fce4ec' : '#e3f2fd' }]}>
                <MaterialCommunityIcons
                  name={pet.gender === 'female' ? 'gender-female' : 'gender-male'}
                  size={16}
                  color={pet.gender === 'female' ? '#c2185b' : '#1565c0'}
                />
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{pet.name}</Text>
            <Text style={styles.heroBreed}>{pet.breed} • {pet.age} year{pet.age !== 1 ? 's' : ''} old</Text>
            <View style={styles.pillsRow}>
              {pet.weight ? (
                <Pill icon="scale" label={`${pet.weight} ${pet.weightUnit || 'kg'}`} />
              ) : null}
              {pet.birthday ? (
                <Pill icon="cake-variant-outline" label={pet.birthday} />
              ) : null}
              {pet.microchipped ? (
                <Pill icon="chip" label="Microchipped" />
              ) : null}
            </View>
          </View>
        </View>

        {/* Health Stats */}
        {pet.healthStats && (
          <View style={styles.healthCard}>
            <View style={styles.healthHeader}>
              <Text style={styles.healthTitle}>
                <MaterialCommunityIcons name="heart-pulse" size={18} color={colors.onSecondary} /> Health Stats
              </Text>
              <Text style={styles.healthSub}>Last checkup: {pet.healthStats.lastCheckup || 'Unknown'}</Text>
            </View>
            <View style={styles.statsGrid}>
              <HealthStat label="Heart Rate" value={pet.healthStats.heartRate ? `${pet.healthStats.heartRate} bpm` : 'N/A'} />
              <HealthStat label="Weight" value={pet.healthStats.weightStatus || 'Unknown'} />
              <HealthStat label="Activity" value={pet.healthStats.activityLevel || 'Low'} />
              <HealthStat label="Next Vax" value={pet.healthStats.nextVax || 'Not set'} />
            </View>
          </View>
        )}

        {/* Vaccinations quick */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vaccinations</Text>
            <TouchableOpacity onPress={() => navigation.navigate('VaccinationTracker', { petId })}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {nextVax ? (
            <View style={styles.vaxRow}>
              <MaterialCommunityIcons name="needle" size={20} color={colors.tertiary} />
              <Text style={styles.vaxName}>{nextVax.name}</Text>
              <Text style={styles.vaxDate}>{nextVax.dueDate}</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No upcoming vaccinations</Text>
          )}
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.navigate('VaccinationTracker', { petId })}
          >
            <MaterialCommunityIcons name="needle" size={16} color={colors.tertiary} />
            <Text style={styles.outlineBtnText}>Manage Vaccinations</Text>
          </TouchableOpacity>
        </View>

        {/* Activities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Daily Activities</Text>
            <TouchableOpacity onPress={() => setActivityModal(true)}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {(pet.activities || []).length === 0 ? (
            <Text style={styles.emptyText}>No activities yet. Add one!</Text>
          ) : (
            pet.activities.map((act) => (
              <ActivityRow key={act.id} activity={act} />
            ))
          )}
        </View>

        {/* Favorite Foods */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Favorite Foods</Text>
            <TouchableOpacity onPress={() => setFoodModal(true)}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.foodsWrap}>
            {(pet.favoriteFoods || []).map((food) => (
              <TouchableOpacity key={food.id} onLongPress={() => removeFavoriteFood(petId, food.id)}>
                <View style={styles.foodChip}>
                  <Text style={styles.foodChipText}>{food.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {(pet.favoriteFoods || []).length === 0 && (
              <Text style={styles.emptyText}>No favorite foods yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Add Food Modal */}
      <Modal visible={foodModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Favorite Food</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Salmon Kibble"
              placeholderTextColor={colors.onSurfaceVariant}
              value={newFood}
              onChangeText={setNewFood}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setFoodModal(false); setNewFood(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddFood}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Activity Modal */}
      <Modal visible={activityModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Activity</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Activity name (e.g. Park Walk)"
              placeholderTextColor={colors.onSurfaceVariant}
              value={newActivity.name}
              onChangeText={(v) => setNewActivity({ ...newActivity, name: v })}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm }]}
              placeholder="Duration (minutes)"
              placeholderTextColor={colors.onSurfaceVariant}
              value={newActivity.duration}
              onChangeText={(v) => setNewActivity({ ...newActivity, duration: v })}
              keyboardType="number-pad"
            />
            <View style={styles.timeRow}>
              {['morning', 'afternoon', 'evening'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChip, newActivity.timeOfDay === t && styles.timeChipActive]}
                  onPress={() => setNewActivity({ ...newActivity, timeOfDay: t })}
                >
                  <Text style={[styles.timeChipText, newActivity.timeOfDay === t && { color: colors.onPrimary }]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setActivityModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddActivity}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Pill({ icon, label }) {
  return (
    <View style={styles.pill}>
      <MaterialCommunityIcons name={icon} size={13} color={colors.onSurfaceVariant} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function HealthStat({ label, value }) {
  return (
    <View style={styles.healthStat}>
      <Text style={styles.healthStatLabel}>{label}</Text>
      <Text style={styles.healthStatValue}>{value}</Text>
    </View>
  );
}

function ActivityRow({ activity }) {
  const iconMap = { tree: 'tree', 'tennis-ball': 'tennis-ball', school: 'school', cat: 'cat', sleep: 'sleep', run: 'run', swimming: 'swimming', bike: 'bike', 'dog-side': 'dog-side', 'toy-brick': 'toy-brick' };
  const icon = iconMap[activity.icon] || 'run';
  const bgColors = { morning: colors.primaryFixed, afternoon: colors.tertiaryFixed, evening: colors.surfaceVariant };
  const fgColors = { morning: colors.primaryContainer, afternoon: colors.tertiary, evening: colors.onSurfaceVariant };
  return (
    <View style={styles.actRow}>
      <View style={[styles.actIcon, { backgroundColor: bgColors[activity.timeOfDay] || colors.primaryFixed }]}>
        <MaterialCommunityIcons name={icon} size={18} color={fgColors[activity.timeOfDay] || colors.primaryContainer} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actName}>{activity.name}</Text>
        <Text style={styles.actDetail}>{activity.duration} mins • {activity.timeOfDay}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  empty: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.margin, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, justifyContent: 'center', alignItems: 'center',
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.lg,
  },
  editBtnText: { ...typography.labelMd, color: colors.primaryContainer },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, ...shadows.card, marginBottom: spacing.md,
  },
  heroAvatar: {
    width: 90, height: 90, borderRadius: radii.full,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: colors.surfaceContainerHighest,
  },
  heroAvatarText: { ...typography.display, fontSize: 36, color: colors.primaryContainer },
  genderBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: radii.full,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.surfaceContainerLowest,
  },
  heroInfo: { flex: 1 },
  heroName: { ...typography.display, fontSize: 34, color: colors.onSurface, lineHeight: 40 },
  heroBreed: { ...typography.bodyLg, color: colors.onSurfaceVariant, marginBottom: spacing.sm },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  pillText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  healthCard: {
    backgroundColor: colors.secondaryContainer,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, marginBottom: spacing.md,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  healthTitle: { ...typography.titleLg, color: colors.onSecondary },
  healthSub: { ...typography.labelSm, color: 'rgba(255,255,255,0.7)' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  healthStat: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md, padding: spacing.sm,
  },
  healthStatLabel: { ...typography.labelSm, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  healthStatValue: { ...typography.headlineMd, color: colors.onSecondary, fontSize: 18 },
  section: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, padding: spacing.md,
    borderRadius: radii.xl, marginBottom: spacing.md, ...shadows.card,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { ...typography.titleLg, color: colors.onSurface },
  seeAll: { ...typography.labelMd, color: colors.secondary },
  vaxRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow, padding: spacing.sm, borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  vaxName: { ...typography.labelMd, color: colors.onSurface, flex: 1 },
  vaxDate: { ...typography.labelSm, color: colors.onSurfaceVariant },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, borderWidth: 1, borderColor: colors.tertiaryFixed,
    paddingVertical: spacing.sm, borderRadius: radii.lg,
  },
  outlineBtnText: { ...typography.labelMd, color: colors.tertiary },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  actRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radii.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow,
  },
  actIcon: { width: 40, height: 40, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  actName: { ...typography.labelMd, color: colors.onSurface },
  actDetail: { ...typography.labelSm, color: colors.onSurfaceVariant },
  foodsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  foodChip: {
    backgroundColor: colors.surfaceContainer, borderRadius: radii.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.surfaceContainerHighest,
  },
  foodChipText: { ...typography.labelMd, color: colors.onSurface },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.lg, paddingBottom: spacing.xl,
  },
  modalTitle: { ...typography.titleLg, color: colors.onSurface, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant, ...typography.bodyMd, color: colors.onSurface,
  },
  timeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  timeChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { ...typography.labelMd, color: colors.onSurfaceVariant, textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancel: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh, alignItems: 'center',
  },
  modalCancelText: { ...typography.labelMd, color: colors.onSurface },
  modalAdd: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  modalAddText: { ...typography.labelMd, color: colors.onPrimary },
});
