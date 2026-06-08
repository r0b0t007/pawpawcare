import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { resolveAsset } from '../../config';
import { colors, typography, spacing, radii, shadows } from '../../theme';

export default function PetProfileScreen({ navigation, route }) {
  const { petId } = route.params;
  const {
    pets, myReports, addFavoriteFood, removeFavoriteFood, addActivity,
    addMedication, deleteMedication, logMedicationDose, reportPetLost, resolveLostPet,
    addWeight, deleteWeight,
  } = useData();
  const pet = pets.find((p) => p.id === petId);
  const activeReport = (myReports || []).find((r) => r.petId === petId && r.status === 'active');

  const [foodModal, setFoodModal] = useState(false);
  const [activityModal, setActivityModal] = useState(false);
  const [medModal, setMedModal] = useState(false);
  const [lostModal, setLostModal] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [newFood, setNewFood] = useState('');
  const [newActivity, setNewActivity] = useState({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: 'daily', times: ['08:00'], notes: '' });
  const [lostForm, setLostForm] = useState({ lastSeenLocation: '', description: '', contactPhone: '' });
  const [newWeight, setNewWeight] = useState({ value: '', unit: pet?.weightUnit || 'kg' });

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

  const handleAddMedication = async () => {
    if (!newMed.name.trim()) return;
    const asNeeded = newMed.frequency === 'as_needed';
    await addMedication(petId, {
      name: newMed.name.trim(),
      dosage: newMed.dosage.trim() || null,
      frequency: newMed.frequency,
      times: asNeeded ? [] : (newMed.times.length ? [...newMed.times].sort() : ['08:00']),
      notes: newMed.notes.trim() || null,
    });
    setNewMed({ name: '', dosage: '', frequency: 'daily', times: ['08:00'], notes: '' });
    setMedModal(false);
  };

  const toggleMedTime = (t) => {
    setNewMed((m) => ({
      ...m,
      times: m.times.includes(t) ? m.times.filter((x) => x !== t) : [...m.times, t],
    }));
  };

  const handleReportLost = async () => {
    await reportPetLost(petId, lostForm);
    setLostForm({ lastSeenLocation: '', description: '', contactPhone: '' });
    setLostModal(false);
  };

  const handleMarkFound = () => {
    if (!activeReport) return;
    Alert.alert('Mark as found', `Has ${pet.name} been found safe?`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Found!', onPress: () => resolveLostPet(activeReport.id) },
    ]);
  };

  const handleAddWeight = async () => {
    const v = parseFloat(newWeight.value);
    if (!v || v <= 0) return;
    await addWeight(petId, { weight: v, unit: newWeight.unit });
    setNewWeight({ value: '', unit: pet.weightUnit || 'kg' });
    setWeightModal(false);
  };

  const upcoming = (pet.vaccinations || []).filter((v) => v.status !== 'completed');
  const nextVax = upcoming[0];
  const petColor = pet.color || colors.primaryFixed;

  const weights = pet.weights || [];
  const latestWeight = weights[weights.length - 1];
  const prevWeight = weights.length >= 2 ? weights[weights.length - 2] : null;
  const weightTrend = latestWeight && prevWeight ? latestWeight.weight - prevWeight.weight : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Hero band */}
        <View style={[styles.heroBand, { backgroundColor: petColor }]}>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.primaryContainer} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('AddPet', { petId })}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primaryContainer} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroContent}>
            <View style={styles.heroAvatarWrap}>
              <View style={[styles.heroAvatar, { backgroundColor: 'rgba(255,255,255,0.35)' }]}>
                {pet.avatarUrl ? (
                  <Image source={{ uri: resolveAsset(pet.avatarUrl) }} style={styles.heroAvatarImg} />
                ) : (
                  <Text style={styles.heroAvatarText}>{pet.name[0]}</Text>
                )}
              </View>
              {pet.gender && (
                <View style={[styles.genderBadge, { backgroundColor: pet.gender === 'female' ? '#fce4ec' : '#e3f2fd' }]}>
                  <MaterialCommunityIcons
                    name={pet.gender === 'female' ? 'gender-female' : 'gender-male'}
                    size={14}
                    color={pet.gender === 'female' ? '#c2185b' : '#1565c0'}
                  />
                </View>
              )}
            </View>
            <Text style={styles.heroName}>{pet.name}</Text>
            <Text style={styles.heroBreed}>
              {pet.type ? pet.type.charAt(0).toUpperCase() + pet.type.slice(1) : ''}
              {pet.breed ? ` · ${pet.breed}` : ''}
              {pet.age ? ` · ${pet.age} yr${pet.age !== 1 ? 's' : ''}` : ''}
            </Text>
            <View style={styles.pillsRow}>
              {pet.weight ? <Pill icon="scale" label={`${pet.weight} ${pet.weightUnit || 'kg'}`} /> : null}
              {pet.birthday ? <Pill icon="cake-variant-outline" label={pet.birthday} /> : null}
              {pet.microchipped ? <Pill icon="chip" label="Microchipped" /> : null}
            </View>
          </View>
        </View>

        {/* Curved transition */}
        <View style={[styles.heroTail, { backgroundColor: petColor }]}>
          <View style={styles.heroTailCurve} />
        </View>

        {/* Lost-pet status / report */}
        {activeReport ? (
          <TouchableOpacity style={styles.lostActiveBanner} onPress={handleMarkFound} activeOpacity={0.9}>
            <View style={styles.lostActiveIcon}>
              <MaterialCommunityIcons name="map-marker-alert" size={20} color={colors.onErrorContainer} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lostActiveTitle}>{pet.name} is reported lost</Text>
              <Text style={styles.lostActiveSub}>Shared to the community board · tap to mark found</Text>
            </View>
            <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.successFg} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.reportLostBtn} onPress={() => setLostModal(true)} activeOpacity={0.88}>
            <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color={colors.error} />
            <Text style={styles.reportLostText}>Report {pet.name} as lost</Text>
          </TouchableOpacity>
        )}

        {/* Health Stats */}
        {pet.healthStats && (
          <View style={styles.healthCard}>
            <View style={styles.healthHeader}>
              <MaterialCommunityIcons name="heart-pulse" size={18} color={colors.secondary} />
              <Text style={styles.healthTitle}>Health Stats</Text>
              <Text style={styles.healthSub}>Last checkup: {pet.healthStats.lastCheckup || 'Unknown'}</Text>
            </View>
            <View style={styles.statsGrid}>
              <HealthStat icon="heart-pulse" label="Heart Rate" value={pet.healthStats.heartRate ? `${pet.healthStats.heartRate} bpm` : 'N/A'} color={colors.error} />
              <HealthStat icon="scale" label="Weight" value={pet.healthStats.weightStatus || 'Unknown'} color={colors.tertiary} />
              <HealthStat icon="run" label="Activity" value={pet.healthStats.activityLevel || 'Low'} color={colors.primaryContainer} />
              <HealthStat icon="needle" label="Next Vax" value={pet.healthStats.nextVax || 'Not set'} color={colors.secondary} />
            </View>
          </View>
        )}

        {/* Weight */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Weight</Text>
            <TouchableOpacity
              onPress={() => setWeightModal(true)}
              style={styles.addIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          {weights.length === 0 ? (
            <TouchableOpacity style={styles.emptyState} onPress={() => setWeightModal(true)} activeOpacity={0.88}>
              <MaterialCommunityIcons name="scale-bathroom" size={24} color={colors.primaryContainer} />
              <Text style={styles.emptyStateText}>Track {pet.name}'s weight</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.weightHeadRow}>
                <Text style={styles.weightCurrent}>
                  {latestWeight.weight}<Text style={styles.weightUnit}> {latestWeight.unit}</Text>
                </Text>
                {weightTrend !== null && (
                  <View style={styles.trendPill}>
                    <MaterialCommunityIcons
                      name={weightTrend > 0 ? 'trending-up' : weightTrend < 0 ? 'trending-down' : 'trending-neutral'}
                      size={14}
                      color={colors.secondary}
                    />
                    <Text style={styles.trendText}>
                      {weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)} {latestWeight.unit}
                    </Text>
                  </View>
                )}
              </View>
              <WeightChart weights={weights} />
              {[...weights].reverse().slice(0, 4).map((w) => (
                <View key={w.id} style={styles.weightRow}>
                  <Text style={styles.weightRowVal}>{w.weight} {w.unit}</Text>
                  <Text style={styles.weightRowDate}>{fullDate(w.loggedAt)}</Text>
                  <TouchableOpacity onPress={() => deleteWeight(petId, w.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Vaccinations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vaccinations</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('VaccinationTracker', { petId })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {nextVax ? (
            <View style={styles.vaxRow}>
              <View style={[styles.vaxDot, { backgroundColor: colors.tertiaryFixed }]}>
                <MaterialCommunityIcons name="needle" size={16} color={colors.tertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vaxName}>{nextVax.name}</Text>
                <Text style={styles.vaxDate}>Due: {nextVax.dueDate}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outlineVariant} />
            </View>
          ) : (
            <View style={styles.emptyRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.successFg || colors.secondary} />
              <Text style={styles.emptyText}>All vaccinations up to date</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.navigate('VaccinationTracker', { petId })}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="needle" size={16} color={colors.tertiary} />
            <Text style={styles.outlineBtnText}>Manage Vaccinations</Text>
          </TouchableOpacity>
        </View>

        {/* Medications */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Medications</Text>
            <TouchableOpacity
              onPress={() => setMedModal(true)}
              style={styles.addIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          {(pet.medications || []).length === 0 ? (
            <TouchableOpacity style={styles.emptyState} onPress={() => setMedModal(true)} activeOpacity={0.88}>
              <MaterialCommunityIcons name="pill" size={24} color={colors.primaryContainer} />
              <Text style={styles.emptyStateText}>Add a medication</Text>
            </TouchableOpacity>
          ) : (
            pet.medications.map((med) => (
              <MedicationRow
                key={med.id}
                med={med}
                onLog={() => logMedicationDose(petId, med.id)}
                onDelete={() => Alert.alert('Remove medication', `Remove ${med.name}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => deleteMedication(petId, med.id) },
                ])}
              />
            ))
          )}
        </View>

        {/* Activities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Daily Activities</Text>
            <TouchableOpacity
              onPress={() => setActivityModal(true)}
              style={styles.addIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          {(pet.activities || []).length === 0 ? (
            <TouchableOpacity style={styles.emptyState} onPress={() => setActivityModal(true)} activeOpacity={0.88}>
              <MaterialCommunityIcons name="run" size={24} color={colors.primaryContainer} />
              <Text style={styles.emptyStateText}>Add a daily activity</Text>
            </TouchableOpacity>
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
            <TouchableOpacity
              onPress={() => setFoodModal(true)}
              style={styles.addIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.foodsWrap}>
            {(pet.favoriteFoods || []).map((food) => (
              <View key={food.id} style={styles.foodChip}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={13} color={colors.primaryContainer} />
                <Text style={styles.foodChipText}>{food.name}</Text>
                <TouchableOpacity
                  onPress={() => removeFavoriteFood(petId, food.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <MaterialCommunityIcons name="close" size={13} color={colors.outline} />
                </TouchableOpacity>
              </View>
            ))}
            {(pet.favoriteFoods || []).length === 0 && (
              <TouchableOpacity style={styles.emptyState} onPress={() => setFoodModal(true)} activeOpacity={0.88}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={24} color={colors.primaryContainer} />
                <Text style={styles.emptyStateText}>Add a favorite food</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Add Food Modal */}
      <Modal visible={foodModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add Favorite Food</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Salmon Kibble"
              placeholderTextColor={colors.outlineVariant}
              value={newFood}
              onChangeText={setNewFood}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setFoodModal(false); setNewFood(''); }} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddFood} activeOpacity={0.88}>
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
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add Activity</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Activity name (e.g. Park Walk)"
              placeholderTextColor={colors.outlineVariant}
              value={newActivity.name}
              onChangeText={(v) => setNewActivity({ ...newActivity, name: v })}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm }]}
              placeholder="Duration in minutes"
              placeholderTextColor={colors.outlineVariant}
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
                  activeOpacity={0.88}
                >
                  <Text style={[styles.timeChipText, newActivity.timeOfDay === t && { color: colors.onPrimary }]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setActivityModal(false)} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddActivity} activeOpacity={0.88}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Medication Modal */}
      <Modal visible={medModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add Medication</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name (e.g. Apoquel)"
              placeholderTextColor={colors.outlineVariant}
              value={newMed.name}
              onChangeText={(v) => setNewMed({ ...newMed, name: v })}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm }]}
              placeholder="Dosage (e.g. 5mg, 1 tablet)"
              placeholderTextColor={colors.outlineVariant}
              value={newMed.dosage}
              onChangeText={(v) => setNewMed({ ...newMed, dosage: v })}
            />
            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.timeRow}>
              {['daily', 'weekly', 'monthly', 'as_needed'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqChip, newMed.frequency === f && styles.timeChipActive]}
                  onPress={() => setNewMed({ ...newMed, frequency: f })}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.freqChipText, newMed.frequency === f && { color: colors.onPrimary }]}>
                    {f === 'as_needed' ? 'As needed' : f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {newMed.frequency !== 'as_needed' && (
              <>
                <Text style={styles.fieldLabel}>Dose times</Text>
                <View style={styles.timeRow}>
                  {[['Morning', '08:00'], ['Noon', '12:00'], ['Evening', '18:00'], ['Night', '22:00']].map(([label, t]) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.freqChip, newMed.times.includes(t) && styles.timeChipActive]}
                      onPress={() => toggleMedTime(t)}
                      activeOpacity={0.88}
                    >
                      <Text style={[styles.freqChipText, newMed.times.includes(t) && { color: colors.onPrimary }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setMedModal(false)} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddMedication} activeOpacity={0.88}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Report Lost Modal */}
      <Modal visible={lostModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Report {pet.name} as lost</Text>
            <Text style={styles.modalHint}>This shares an alert to the community Lost Pets board.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Last seen location (e.g. Riverside Park)"
              placeholderTextColor={colors.outlineVariant}
              value={lostForm.lastSeenLocation}
              onChangeText={(v) => setLostForm({ ...lostForm, lastSeenLocation: v })}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm, minHeight: 70 }]}
              placeholder="Details (color, collar, temperament…)"
              placeholderTextColor={colors.outlineVariant}
              value={lostForm.description}
              onChangeText={(v) => setLostForm({ ...lostForm, description: v })}
              multiline
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm }]}
              placeholder="Contact phone"
              placeholderTextColor={colors.outlineVariant}
              value={lostForm.contactPhone}
              onChangeText={(v) => setLostForm({ ...lostForm, contactPhone: v })}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setLostModal(false)} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAdd, { backgroundColor: colors.error }]} onPress={handleReportLost} activeOpacity={0.88}>
                <Text style={styles.modalAddText}>Report Lost</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Weight Modal */}
      <Modal visible={weightModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Log {pet.name}'s weight</Text>
            <View style={styles.weightInputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="e.g. 22.5"
                placeholderTextColor={colors.outlineVariant}
                value={newWeight.value}
                onChangeText={(v) => setNewWeight({ ...newWeight, value: v })}
                keyboardType="decimal-pad"
                autoFocus
              />
              <TouchableOpacity
                style={styles.unitToggle}
                onPress={() => setNewWeight({ ...newWeight, unit: newWeight.unit === 'kg' ? 'lbs' : 'kg' })}
                activeOpacity={0.85}
              >
                <Text style={styles.unitToggleText}>{newWeight.unit}</Text>
                <MaterialCommunityIcons name="swap-horizontal" size={16} color={colors.primaryContainer} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setWeightModal(false)} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddWeight} activeOpacity={0.88}>
                <Text style={styles.modalAddText}>Log Weight</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const shortDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const fullDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function WeightChart({ weights }) {
  const data = weights.slice(-10);
  if (data.length < 2) {
    return <Text style={styles.chartHint}>Add another entry to see the trend.</Text>;
  }
  const vals = data.map((d) => d.weight);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  return (
    <View style={styles.chart}>
      {data.map((d) => {
        const h = 18 + ((d.weight - min) / range) * 78;
        return (
          <View key={d.id} style={styles.chartCol}>
            <Text style={styles.chartVal}>{d.weight}</Text>
            <View style={[styles.chartBar, { height: h }]} />
            <Text style={styles.chartDate} numberOfLines={1}>{shortDate(d.loggedAt)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MedicationRow({ med, onLog, onDelete }) {
  const freqLabel = med.frequency === 'as_needed'
    ? 'As needed'
    : `${med.frequency.charAt(0).toUpperCase() + med.frequency.slice(1)}${med.times?.length ? ` · ${med.times.join(', ')}` : ''}`;
  const lastGiven = med.lastAdministeredAt
    ? new Date(med.lastAdministeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.medRow, !med.active && { opacity: 0.55 }]}>
      <View style={styles.medIcon}>
        <MaterialCommunityIcons name="pill" size={18} color={colors.primaryContainer} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.medName}>
          {med.name}{med.dosage ? <Text style={styles.medDosage}>  ·  {med.dosage}</Text> : null}
        </Text>
        <Text style={styles.medFreq}>{freqLabel}</Text>
        {lastGiven && <Text style={styles.medLast}>Last given: {lastGiven}</Text>}
      </View>
      <TouchableOpacity style={styles.logBtn} onPress={onLog} activeOpacity={0.85}>
        <MaterialCommunityIcons name="check" size={14} color={colors.onPrimary} />
        <Text style={styles.logBtnText}>Log</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ paddingLeft: spacing.xs }}>
        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

function Pill({ icon, label }) {
  return (
    <View style={styles.pill}>
      <MaterialCommunityIcons name={icon} size={12} color="rgba(101,62,0,0.7)" />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function HealthStat({ icon, label, value, color }) {
  return (
    <View style={styles.healthStat}>
      <View style={[styles.healthStatIcon, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon} size={14} color={color} />
      </View>
      <Text style={styles.healthStatLabel}>{label}</Text>
      <Text style={styles.healthStatValue}>{value}</Text>
    </View>
  );
}

function ActivityRow({ activity }) {
  const bgColors = { morning: colors.primaryFixed, afternoon: colors.tertiaryFixed, evening: colors.surfaceVariant };
  const fgColors = { morning: colors.primaryContainer, afternoon: colors.tertiary, evening: colors.onSurfaceVariant };
  const timeIcons = { morning: 'weather-sunny', afternoon: 'weather-partly-cloudy', evening: 'weather-night' };
  return (
    <View style={styles.actRow}>
      <View style={[styles.actIcon, { backgroundColor: bgColors[activity.timeOfDay] || colors.primaryFixed }]}>
        <MaterialCommunityIcons name={timeIcons[activity.timeOfDay] || 'run'} size={16} color={fgColors[activity.timeOfDay] || colors.primaryContainer} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actName}>{activity.name}</Text>
        <Text style={styles.actDetail}>{activity.duration} min · {activity.timeOfDay}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  empty: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  heroBand: { paddingBottom: 28 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  editBtnText: { ...typography.labelMd, color: colors.primaryContainer },
  heroContent: { alignItems: 'center', paddingBottom: spacing.sm },
  heroAvatarWrap: { position: 'relative', marginBottom: spacing.sm },
  heroAvatar: {
    width: 100,
    height: 100,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  heroAvatarImg: { width: '100%', height: '100%' },
  heroAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 40, color: colors.primaryContainer },
  genderBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  heroName: { ...typography.headlineLg, color: colors.primaryContainer, fontSize: 28, letterSpacing: -0.3 },
  heroBreed: { ...typography.bodyMd, color: 'rgba(101,62,0,0.65)', marginBottom: spacing.sm },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', paddingHorizontal: spacing.margin },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  pillText: { ...typography.labelSm, color: colors.primaryContainer },
  heroTail: { height: 28 },
  heroTailCurve: {
    height: 28,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
  },
  healthCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    padding: spacing.md,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    ...shadows.medium,
    borderWidth: 1,
    borderColor: colors.secondaryFixed,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  healthTitle: { ...typography.titleLg, color: colors.onSurface, flex: 1 },
  healthSub: { ...typography.labelSm, color: colors.onSurfaceVariant },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  healthStat: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 3,
  },
  healthStatIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  healthStatLabel: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 },
  healthStatValue: { ...typography.titleLg, color: colors.onSurface, fontSize: 16 },
  section: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    padding: spacing.md,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.titleLg, color: colors.onSurface },
  addIconBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seeAll: { ...typography.labelMd, color: colors.secondary, fontSize: 13 },
  vaxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  vaxDot: { width: 36, height: 36, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  vaxName: { ...typography.labelMd, color: colors.onSurface },
  vaxDate: { ...typography.labelSm, color: colors.onSurfaceVariant },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.tertiaryFixed,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(0,76,106,0.04)',
  },
  outlineBtnText: { ...typography.labelMd, color: colors.tertiary },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 14 },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
  },
  emptyStateText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  actIcon: { width: 38, height: 38, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  actName: { ...typography.labelMd, color: colors.onSurface },
  actDetail: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: 'capitalize' },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  medIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  medName: { ...typography.labelMd, color: colors.onSurface },
  medDosage: { ...typography.labelSm, color: colors.onSurfaceVariant },
  medFreq: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1, textTransform: 'capitalize' },
  medLast: { ...typography.labelSm, color: colors.tertiary, marginTop: 1 },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  logBtnText: { ...typography.labelSm, color: colors.onPrimary },
  fieldLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, marginTop: spacing.md, marginBottom: spacing.xs },
  freqChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
  },
  freqChipText: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: 'capitalize' },
  reportLostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.margin,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.errorContainer,
    backgroundColor: '#fff1f0',
  },
  reportLostText: { ...typography.labelMd, color: colors.error },
  lostActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.margin,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: '#fff1f0',
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  lostActiveIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.errorContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lostActiveTitle: { ...typography.labelMd, color: colors.onSurface },
  lostActiveSub: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  modalHint: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: -spacing.sm, marginBottom: spacing.sm },
  weightHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  weightCurrent: { ...typography.headlineMd, color: colors.onSurface, fontSize: 26 },
  weightUnit: { ...typography.titleLg, color: colors.onSurfaceVariant, fontSize: 16 },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.secondaryFixed,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  trendText: { ...typography.labelSm, color: colors.secondary, fontFamily: 'PlusJakartaSans_600SemiBold' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: spacing.xs,
    height: 140,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  chartVal: { ...typography.labelSm, color: colors.onSurfaceVariant, fontSize: 10 },
  chartBar: { width: '70%', maxWidth: 22, borderRadius: radii.sm, backgroundColor: colors.primaryFixedDim },
  chartDate: { ...typography.labelSm, color: colors.outline, fontSize: 9 },
  chartHint: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, paddingVertical: spacing.sm },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  weightRowVal: { ...typography.labelMd, color: colors.onSurface, width: 90 },
  weightRowDate: { ...typography.labelSm, color: colors.onSurfaceVariant, flex: 1 },
  weightInputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
  },
  unitToggleText: { ...typography.labelMd, color: colors.primaryContainer },
  foodsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.primaryFixedDim,
  },
  foodChipText: { ...typography.labelMd, color: colors.primaryContainer, fontSize: 13 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.outlineVariant,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.titleLg, color: colors.onSurface, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    ...typography.bodyMd,
    color: colors.onSurface,
    minHeight: 50,
  },
  timeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  timeChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { ...typography.labelMd, color: colors.onSurfaceVariant, textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancel: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modalCancelText: { ...typography.labelMd, color: colors.onSurface },
  modalAdd: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    ...shadows.button,
  },
  modalAddText: { ...typography.labelMd, color: colors.onPrimary },
});
