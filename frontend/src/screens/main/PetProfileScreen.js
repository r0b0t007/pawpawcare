import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Image, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { resolveAsset } from '../../config';
import { convertWeight, weightInsight } from '../../utils/weight';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const EXPENSE_CATEGORIES = [
  { id: 'vet', label: 'Vet', icon: 'medical-bag' },
  { id: 'food', label: 'Food', icon: 'food-drumstick' },
  { id: 'grooming', label: 'Grooming', icon: 'content-cut' },
  { id: 'medication', label: 'Meds', icon: 'pill' },
  { id: 'supplies', label: 'Supplies', icon: 'package-variant' },
  { id: 'insurance', label: 'Insurance', icon: 'shield-check' },
  { id: 'other', label: 'Other', icon: 'tag-outline' },
];
const catMeta = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export default function PetProfileScreen({ navigation, route }) {
  const { petId } = route.params;
  const {
    pets, myReports, addFavoriteFood, removeFavoriteFood, addActivity,
    addMedication, deleteMedication, logMedicationDose, reportPetLost, resolveLostPet,
    addWeight, deleteWeight, addExpense, deleteExpense,
    getPetShare, invitePetMember, cancelPetInvite, removePetMember, leavePet,
    createShareLink, revokeShareLinks,
    getCareProfile, saveCareProfile, createCareLink, revokeCareLinks,
  } = useData();
  const { user } = useAuth();
  const pet = pets.find((p) => p.id === petId);
  const activeReport = (myReports || []).find((r) => r.petId === petId && r.status === 'active');
  const isOwner = !!pet && pet.ownerId === user?.id;

  const [foodModal, setFoodModal] = useState(false);
  const [activityModal, setActivityModal] = useState(false);
  const [medModal, setMedModal] = useState(false);
  const [lostModal, setLostModal] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [newFood, setNewFood] = useState('');
  const [newActivity, setNewActivity] = useState({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: 'daily', times: ['08:00'], notes: '' });
  const [lostForm, setLostForm] = useState({ lastSeenLocation: '', description: '', contactPhone: '' });
  const [newWeight, setNewWeight] = useState({ value: '' });
  const [expenseModal, setExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: 'vet', amount: '', notes: '' });
  const [share, setShare] = useState(null); // { owner, members, invites }
  const [shareModal, setShareModal] = useState(false);
  const [vetShareModal, setVetShareModal] = useState(false);
  const [caretakerModal, setCaretakerModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const loadShare = useCallback(async () => {
    const data = await getPetShare(petId);
    if (data) setShare(data);
  }, [getPetShare, petId]);

  useEffect(() => { loadShare(); }, [loadShare]);

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
    await addWeight(petId, { weight: v }); // unit is locked to the pet's unit server-side
    setNewWeight({ value: '' });
    setWeightModal(false);
  };

  const handleAddExpense = async () => {
    const amt = parseFloat(newExpense.amount);
    if (!amt || amt <= 0) return;
    await addExpense(petId, { category: newExpense.category, amount: amt, notes: newExpense.notes.trim() || null });
    setNewExpense({ category: 'vet', amount: '', notes: '' });
    setExpenseModal(false);
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      await invitePetMember(petId, email);
      setInviteEmail('');
      setShareModal(false);
      await loadShare();
    } catch (err) {
      // Surface the server message (already a member, invalid email, …).
      setInviteError(err.message || 'Could not send the invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRemoveMember = (member) => {
    Alert.alert('Remove co-owner', `Remove ${member.name} from ${pet.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => { await removePetMember(petId, member.id); await loadShare(); },
      },
    ]);
  };

  const handleCancelInvite = (invite) => {
    Alert.alert('Cancel invitation', `Withdraw the invite to ${invite.email}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => { await cancelPetInvite(petId, invite.id); await loadShare(); },
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert('Leave pet', `Stop co-owning ${pet.name}? You'll lose access to its records.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        // Navigate away first so the pet vanishing from state can't flash a
        // "Pet not found" frame; the detach then completes in the background.
        onPress: () => { navigation.goBack(); leavePet(petId); },
      },
    ]);
  };

  const upcoming = (pet.vaccinations || []).filter((v) => v.status !== 'completed');
  const nextVax = upcoming[0];
  const petColor = pet.color || colors.primaryFixed;

  const weights = pet.weights || [];
  const wUnit = pet.weightUnit || 'kg';
  // Normalize every entry to the pet's current unit before charting/trend.
  const normWeights = useMemo(
    () => weights.map((w) => ({ id: w.id, loggedAt: w.loggedAt, value: convertWeight(w.weight, w.unit, wUnit) })),
    [weights, wUnit],
  );
  const latestWeight = normWeights[normWeights.length - 1];
  const wInsight = useMemo(() => weightInsight(normWeights, wUnit), [normWeights, wUnit]);

  const expenses = pet.expenses || [];
  const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisMonthSpend = expenses
    .filter((e) => (e.incurredOn || '').startsWith(monthPrefix))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

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

        {/* Medical Records vault */}
        <TouchableOpacity
          style={styles.recordsBtn}
          onPress={() => navigation.navigate('MedicalRecords', { petId, petName: pet.name })}
          activeOpacity={0.9}
        >
          <View style={styles.recordsIcon}>
            <MaterialCommunityIcons name="folder-heart-outline" size={20} color={colors.tertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recordsTitle}>Medical Records</Text>
            <Text style={styles.recordsSub}>Vet clinics, appointments & documents</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
        </TouchableOpacity>

        {/* Share with vet */}
        <TouchableOpacity
          style={styles.recordsBtn}
          onPress={() => setVetShareModal(true)}
          activeOpacity={0.9}
        >
          <View style={[styles.recordsIcon, { backgroundColor: colors.secondaryFixed }]}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recordsTitle}>Share with vet</Text>
            <Text style={styles.recordsSub}>A read-only link to {pet.name}'s health summary</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
        </TouchableOpacity>

        {/* Caretaker mode */}
        <TouchableOpacity
          style={styles.recordsBtn}
          onPress={() => setCaretakerModal(true)}
          activeOpacity={0.9}
        >
          <View style={[styles.recordsIcon, { backgroundColor: colors.primaryFixed }]}>
            <MaterialCommunityIcons name="home-heart" size={20} color={colors.primaryContainer} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recordsTitle}>Caretaker mode</Text>
            <Text style={styles.recordsSub}>Sitter notes + a time-limited handoff link</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outlineVariant} />
        </TouchableOpacity>

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
                  {latestWeight.value.toFixed(1)}<Text style={styles.weightUnit}> {wUnit}</Text>
                </Text>
                {wInsight && wInsight.direction !== 'stable' && (
                  <View style={styles.trendPill}>
                    <MaterialCommunityIcons
                      name={wInsight.direction === 'up' ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={colors.secondary}
                    />
                    <Text style={styles.trendText}>
                      {wInsight.changeAbs > 0 ? '+' : ''}{wInsight.changeAbs.toFixed(1)} {wUnit}
                    </Text>
                  </View>
                )}
              </View>
              {wInsight && (
                <View style={styles.insightRow}>
                  <MaterialCommunityIcons
                    name={wInsight.direction === 'up' ? 'trending-up' : wInsight.direction === 'down' ? 'trending-down' : 'trending-neutral'}
                    size={14}
                    color={colors.onSurfaceVariant}
                  />
                  <Text style={styles.insightText}>{wInsight.summary}</Text>
                </View>
              )}
              {wInsight?.notable && (
                <View style={styles.insightFlag}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.tertiary} />
                  <Text style={styles.insightFlagText}>Notable change — worth a vet check.</Text>
                </View>
              )}
              <WeightChart weights={normWeights} />
              {[...normWeights].reverse().slice(0, 4).map((w) => (
                <View key={w.id} style={styles.weightRow}>
                  <Text style={styles.weightRowVal}>{w.value.toFixed(1)} {wUnit}</Text>
                  <Text style={styles.weightRowDate}>{fullDate(w.loggedAt)}</Text>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Delete entry', `Remove the ${w.value.toFixed(1)} ${wUnit} entry?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteWeight(petId, w.id) },
                    ])}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
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

        {/* Expenses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Expenses</Text>
            <TouchableOpacity
              onPress={() => setExpenseModal(true)}
              style={styles.addIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          {expenses.length === 0 ? (
            <TouchableOpacity style={styles.emptyState} onPress={() => setExpenseModal(true)} activeOpacity={0.88}>
              <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.primaryContainer} />
              <Text style={styles.emptyStateText}>Track {pet.name}'s expenses</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.spendCard}>
                <Text style={styles.spendLabel}>This month</Text>
                <Text style={styles.spendValue}>{thisMonthSpend.toFixed(2)}</Text>
              </View>
              {expenses.slice(0, 5).map((e) => {
                const m = catMeta(e.category);
                return (
                  <View key={e.id} style={styles.expenseRow}>
                    <View style={styles.expenseIcon}>
                      <MaterialCommunityIcons name={m.icon} size={16} color={colors.primaryContainer} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expenseCat}>{m.label}{e.notes ? <Text style={styles.expenseNote}>  ·  {e.notes}</Text> : null}</Text>
                      <Text style={styles.expenseDate}>{fullDate(e.incurredOn)}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>{Number(e.amount).toFixed(2)}</Text>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Delete expense', `Remove this ${m.label.toLowerCase()} expense?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(petId, e.id) },
                      ])}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{ paddingLeft: spacing.xs }}
                    >
                      <MaterialCommunityIcons name="close" size={15} color={colors.outline} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
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

        {/* Sharing (co-owners) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sharing</Text>
            {isOwner && (
              <TouchableOpacity
                onPress={() => { setInviteError(null); setShareModal(true); }}
                style={styles.addIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="account-plus" size={16} color={colors.onPrimary} />
              </TouchableOpacity>
            )}
          </View>

          {!isOwner && (
            <Text style={styles.shareNote}>
              Shared with you{share?.owner ? ` by ${share.owner.name}` : ''}. You can view and update {pet.name}'s records.
            </Text>
          )}

          {/* Owner */}
          {share?.owner && (
            <View style={styles.shareRow}>
              <View style={styles.shareAvatar}>
                <Text style={styles.shareAvatarText}>{(share.owner.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareName}>{share.owner.name}{share.owner.id === user?.id ? ' (You)' : ''}</Text>
                <Text style={styles.shareEmail}>{share.owner.email}</Text>
              </View>
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeText}>Owner</Text>
              </View>
            </View>
          )}

          {/* Co-owners */}
          {(share?.members || []).map((m) => (
            <View key={m.id} style={styles.shareRow}>
              <View style={[styles.shareAvatar, { backgroundColor: colors.secondaryFixed }]}>
                <Text style={[styles.shareAvatarText, { color: colors.secondary }]}>{(m.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareName}>{m.name}{m.id === user?.id ? ' (You)' : ''}</Text>
                <Text style={styles.shareEmail}>{m.email}</Text>
              </View>
              {isOwner ? (
                <TouchableOpacity onPress={() => handleRemoveMember(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="account-remove-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              ) : (
                <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>Co-owner</Text></View>
              )}
            </View>
          ))}

          {/* Pending invites (owner only) */}
          {isOwner && (share?.invites || []).map((inv) => (
            <View key={inv.id} style={styles.shareRow}>
              <View style={[styles.shareAvatar, { backgroundColor: colors.surfaceContainerHigh }]}>
                <MaterialCommunityIcons name="email-outline" size={18} color={colors.outline} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareName}>{inv.email}</Text>
                <Text style={styles.shareEmail}>Invitation pending</Text>
              </View>
              <TouchableOpacity onPress={() => handleCancelInvite(inv)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>
          ))}

          {isOwner && (share?.members || []).length === 0 && (share?.invites || []).length === 0 && (
            <TouchableOpacity style={styles.emptyState} onPress={() => { setInviteError(null); setShareModal(true); }} activeOpacity={0.88}>
              <MaterialCommunityIcons name="account-multiple-plus-outline" size={24} color={colors.primaryContainer} />
              <Text style={styles.emptyStateText}>Invite a family member to co-own {pet.name}</Text>
            </TouchableOpacity>
          )}

          {!isOwner && (
            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.88}>
              <MaterialCommunityIcons name="exit-to-app" size={16} color={colors.error} />
              <Text style={styles.leaveBtnText}>Leave this pet</Text>
            </TouchableOpacity>
          )}
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
                onChangeText={(v) => setNewWeight({ value: v })}
                keyboardType="decimal-pad"
                autoFocus
              />
              <View style={styles.unitToggle}>
                <Text style={styles.unitToggleText}>{wUnit}</Text>
              </View>
            </View>
            <Text style={styles.modalHint}>Logged in {wUnit} — change the unit in Edit Pet.</Text>
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

      {/* Add Expense Modal */}
      <Modal visible={expenseModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add expense for {pet.name}</Text>
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catWrap}>
              {EXPENSE_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catChip, newExpense.category === c.id && styles.timeChipActive]}
                  onPress={() => setNewExpense({ ...newExpense, category: c.id })}
                  activeOpacity={0.88}
                >
                  <MaterialCommunityIcons
                    name={c.icon}
                    size={14}
                    color={newExpense.category === c.id ? colors.onPrimary : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.catChipText, newExpense.category === c.id && { color: colors.onPrimary }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.md }]}
              placeholder="Amount (e.g. 45.00)"
              placeholderTextColor={colors.outlineVariant}
              value={newExpense.amount}
              onChangeText={(v) => setNewExpense({ ...newExpense, amount: v })}
              keyboardType="decimal-pad"
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: spacing.sm }]}
              placeholder="Note (optional)"
              placeholderTextColor={colors.outlineVariant}
              value={newExpense.notes}
              onChangeText={(v) => setNewExpense({ ...newExpense, notes: v })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setExpenseModal(false)} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={handleAddExpense} activeOpacity={0.88}>
                <Text style={styles.modalAddText}>Add Expense</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite Co-owner Modal */}
      <Modal visible={shareModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Share {pet.name}</Text>
            <Text style={styles.modalHint}>
              Invite someone by email to co-own {pet.name}. They'll be able to view and update its records, but only you can delete the pet.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="family@example.com"
              placeholderTextColor={colors.outlineVariant}
              value={inviteEmail}
              onChangeText={(v) => { setInviteEmail(v); setInviteError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {!!inviteError && <Text style={styles.inviteError}>{inviteError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShareModal(false); setInviteEmail(''); setInviteError(null); }}
                activeOpacity={0.88}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAdd, inviteBusy && { opacity: 0.6 }]}
                onPress={handleInvite}
                disabled={inviteBusy}
                activeOpacity={0.88}
              >
                <Text style={styles.modalAddText}>Send Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <VetShareModal
        visible={vetShareModal}
        petName={pet.name}
        onClose={() => setVetShareModal(false)}
        onCreate={(expiresIn) => createShareLink(petId, expiresIn)}
        onRevoke={() => revokeShareLinks(petId)}
      />
      <CaretakerModal
        visible={caretakerModal}
        petName={pet.name}
        onClose={() => setCaretakerModal(false)}
        onLoad={() => getCareProfile(petId)}
        onSaveNotes={(data) => saveCareProfile(petId, data)}
        onCreate={(expiresIn) => createCareLink(petId, expiresIn)}
        onRevoke={() => revokeCareLinks(petId)}
      />
    </SafeAreaView>
  );
}

const VET_EXPIRIES = [
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
];

// Generate a vet share link, hand it to the OS share sheet, and offer to
// revoke all outstanding links. The link itself is never persisted client-side
// — it's shared straight from the create response.
function VetShareModal({ visible, petName, onClose, onCreate, onRevoke }) {
  const [expiresIn, setExpiresIn] = useState('24h');
  const [link, setLink] = useState(null); // { url, expires_at }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => { setExpiresIn('24h'); setLink(null); setError(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const result = await onCreate(expiresIn);
      setLink(result);
      try {
        await Share.share({
          message: `${petName}'s medical summary (read-only, link expires soon):\n${result.url}`,
        });
      } catch { /* user dismissed the share sheet — link is still shown below */ }
    } catch (e) {
      setError(e.message || 'Could not create the link.');
    } finally { setBusy(false); }
  };

  const reshare = () => {
    if (link) Share.share({ message: `${petName}'s medical summary:\n${link.url}` }).catch(() => {});
  };

  const revoke = () => {
    Alert.alert('Revoke links', `Disable every share link for ${petName}? Anyone holding one will lose access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          setBusy(true); setError(null);
          try { await onRevoke(); setLink(null); Alert.alert('Done', 'All share links have been revoked.'); }
          catch (e) { setError(e.message || 'Could not revoke links.'); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const expiry = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.modalTitle}>Share with vet</Text>
          <Text style={styles.modalHint}>
            Creates a read-only web link to {petName}'s vaccinations, medications, weight, and recent documents. No account needed to open it.
          </Text>

          {!link ? (
            <>
              <Text style={styles.vetLabel}>Link expires after</Text>
              <View style={styles.vetChips}>
                {VET_EXPIRIES.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.vetChip, expiresIn === e.id && styles.vetChipActive]}
                    onPress={() => setExpiresIn(e.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.vetChipText, expiresIn === e.id && { color: colors.onPrimary }]}>{e.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!error && <Text style={styles.inviteError}>{error}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={close} activeOpacity={0.88}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalAdd, busy && { opacity: 0.6 }]} onPress={create} disabled={busy} activeOpacity={0.88}>
                  <Text style={styles.modalAddText}>{busy ? 'Creating…' : 'Create & Share'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.vetLinkBox}>
                <MaterialCommunityIcons name="link-variant" size={16} color={colors.secondary} />
                <Text style={styles.vetLinkText} numberOfLines={1}>{link.url}</Text>
              </View>
              <Text style={styles.vetExpiryNote}>Expires {expiry(link.expires_at)}</Text>
              {!!error && <Text style={styles.inviteError}>{error}</Text>}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={reshare} activeOpacity={0.88}>
                  <Text style={styles.modalCancelText}>Share again</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalAdd} onPress={close} activeOpacity={0.88}>
                  <Text style={styles.modalAddText}>Done</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity style={styles.vetRevoke} onPress={revoke} disabled={busy} activeOpacity={0.7}>
            <MaterialCommunityIcons name="link-off" size={15} color={colors.error} />
            <Text style={styles.vetRevokeText}>Revoke all active links</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const CARE_EXPIRIES = [
  { id: '1d', label: '1 day' },
  { id: '3d', label: '3 days' },
  { id: '7d', label: '1 week' },
  { id: '14d', label: '2 weeks' },
];

// Caretaker mode: edit the sitter handoff notes, then generate a time-limited
// read-only link and hand it to the OS share sheet. Notes are saved before
// minting so the link always reflects the latest edits.
function CaretakerModal({ visible, petName, onClose, onLoad, onSaveNotes, onCreate, onRevoke }) {
  const [form, setForm] = useState({ feeding: '', instructions: '', emergency_name: '', emergency_phone: '' });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [expiresIn, setExpiresIn] = useState('7d');
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // A failed load must not present an editable blank form — saving it would
  // overwrite real notes with nulls. Editing stays locked until a load succeeds.
  const load = () => {
    setLoading(true); setLoadFailed(false);
    onLoad()
      .then((p) => {
        if (p) setForm({
          feeding: p.feeding || '', instructions: p.instructions || '',
          emergency_name: p.emergency_name || '', emergency_phone: p.emergency_phone || '',
        });
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!visible) return;
    setLink(null); setError(null); setSavedOk(false); setExpiresIn('7d');
    load();
  }, [visible]);

  const close = () => { setLink(null); setError(null); onClose(); };

  const bind = (key) => ({
    value: form[key],
    onChangeText: (v) => { setForm({ ...form, [key]: v }); setSavedOk(false); },
    placeholderTextColor: colors.outlineVariant,
  });

  const payload = () => ({
    feeding: form.feeding.trim() || null,
    instructions: form.instructions.trim() || null,
    emergency_name: form.emergency_name.trim() || null,
    emergency_phone: form.emergency_phone.trim() || null,
  });

  const saveNotes = async () => {
    setBusy(true); setError(null);
    try { await onSaveNotes(payload()); setSavedOk(true); }
    catch (e) { setError(e.message || 'Could not save notes.'); } finally { setBusy(false); }
  };

  const createAndShare = async () => {
    setBusy(true); setError(null);
    try {
      await onSaveNotes(payload()); // persist edits so the link reflects them
      const result = await onCreate(expiresIn);
      setLink(result);
      try { await Share.share({ message: `Caring for ${petName} — everything you need (link expires soon):\n${result.url}` }); } catch {}
    } catch (e) { setError(e.message || 'Could not create the link.'); } finally { setBusy(false); }
  };

  const reshare = () => { if (link) Share.share({ message: `Caring for ${petName}:\n${link.url}` }).catch(() => {}); };

  const revoke = () => {
    Alert.alert('Revoke links', `Disable every caretaker link for ${petName}? Anyone holding one will lose access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          setBusy(true); setError(null);
          try { await onRevoke(); setLink(null); Alert.alert('Done', 'All caretaker links have been revoked.'); }
          catch (e) { setError(e.message || 'Could not revoke links.'); } finally { setBusy(false); }
        },
      },
    ]);
  };

  const expiry = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.modalTitle}>Caretaker mode</Text>
          <Text style={styles.modalHint}>
            Notes for whoever looks after {petName}, plus a read-only link you can text them — no app needed.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primaryContainer} style={{ paddingVertical: spacing.lg }} />
          ) : loadFailed ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm }}>
              <Text style={styles.inviteError}>Couldn't load the saved notes — editing is paused so they don't get overwritten.</Text>
              <TouchableOpacity style={styles.modalCancel} onPress={load} activeOpacity={0.88}>
                <Text style={styles.modalCancelText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.vetLabel}>Feeding</Text>
              <TextInput style={[styles.modalInput, styles.careArea]} multiline placeholder="e.g. 1 cup of kibble at 8am & 6pm, fresh water daily" {...bind('feeding')} />
              <Text style={[styles.vetLabel, { marginTop: spacing.sm }]}>Instructions</Text>
              <TextInput style={[styles.modalInput, styles.careArea]} multiline placeholder="Litter box, walks, meds, quirks…" {...bind('instructions')} />
              <View style={styles.careWarn}>
                <MaterialCommunityIcons name="shield-alert-outline" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.careWarnText}>Anyone with the link can read this — skip door codes or alarm PINs, or pick a short expiry.</Text>
              </View>
              <Text style={[styles.vetLabel, { marginTop: spacing.sm }]}>Emergency contact</Text>
              <TextInput style={styles.modalInput} placeholder="Name (e.g. Dr. Meow at Happy Paws)" {...bind('emergency_name')} />
              <TextInput style={[styles.modalInput, { marginTop: spacing.xs }]} placeholder="Phone" keyboardType="phone-pad" {...bind('emergency_phone')} />

              {link ? (
                <>
                  <View style={[styles.vetLinkBox, { marginTop: spacing.md }]}>
                    <MaterialCommunityIcons name="link-variant" size={16} color={colors.secondary} />
                    <Text style={styles.vetLinkText} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Text style={styles.vetExpiryNote}>Expires {expiry(link.expires_at)}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.vetLabel, { marginTop: spacing.md }]}>Link expires after</Text>
                  <View style={styles.vetChips}>
                    {CARE_EXPIRIES.map((e) => (
                      <TouchableOpacity key={e.id} style={[styles.vetChip, expiresIn === e.id && styles.vetChipActive]} onPress={() => setExpiresIn(e.id)} activeOpacity={0.85}>
                        <Text style={[styles.vetChipText, expiresIn === e.id && { color: colors.onPrimary }]}>{e.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {!!error && <Text style={styles.inviteError}>{error}</Text>}
              {savedOk && !link && <Text style={styles.careSaved}>Notes saved ✓</Text>}
            </ScrollView>
          )}

          <View style={styles.modalActions}>
            {link ? (
              <>
                <TouchableOpacity style={styles.modalCancel} onPress={reshare} activeOpacity={0.88}><Text style={styles.modalCancelText}>Share again</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalAdd} onPress={close} activeOpacity={0.88}><Text style={styles.modalAddText}>Done</Text></TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.modalCancel, (busy || loadFailed) && { opacity: 0.6 }]} onPress={saveNotes} disabled={busy || loading || loadFailed} activeOpacity={0.88}><Text style={styles.modalCancelText}>{busy ? '…' : 'Save notes'}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalAdd, (busy || loadFailed) && { opacity: 0.6 }]} onPress={createAndShare} disabled={busy || loading || loadFailed} activeOpacity={0.88}><Text style={styles.modalAddText}>{busy ? 'Working…' : 'Create & Share'}</Text></TouchableOpacity>
              </>
            )}
          </View>
          {!link && (
            <TouchableOpacity style={styles.vetRevoke} onPress={revoke} disabled={busy} activeOpacity={0.7}>
              <MaterialCommunityIcons name="link-off" size={15} color={colors.error} />
              <Text style={styles.vetRevokeText}>Revoke all active links</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const shortDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const fullDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function WeightChart({ weights }) {
  const data = weights.slice(-10);
  if (data.length < 2) {
    return <Text style={styles.chartHint}>Add another entry to see the trend.</Text>;
  }
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  return (
    <View style={styles.chart}>
      {data.map((d) => {
        const h = 18 + ((d.value - min) / range) * 78;
        return (
          <View key={d.id} style={styles.chartCol}>
            <Text style={styles.chartVal}>{d.value.toFixed(1)}</Text>
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
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  insightText: { ...typography.labelSm, color: colors.onSurfaceVariant, flex: 1 },
  insightFlag: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.tertiaryFixed, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.sm,
  },
  insightFlagText: { ...typography.labelSm, color: colors.tertiary, flex: 1 },
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
  spendCard: {
    backgroundColor: colors.secondaryFixed,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spendLabel: { ...typography.labelMd, color: colors.onSecondaryFixed || colors.secondary },
  spendValue: { ...typography.headlineMd, color: colors.secondary, fontSize: 22 },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseCat: { ...typography.labelMd, color: colors.onSurface },
  expenseNote: { ...typography.labelSm, color: colors.onSurfaceVariant },
  expenseDate: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  expenseAmount: { ...typography.labelMd, color: colors.onSurface, fontFamily: 'PlusJakartaSans_700Bold' },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
  },
  catChipText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  recordsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.margin,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLowest,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.tertiaryFixed,
  },
  recordsIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.tertiaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordsTitle: { ...typography.labelMd, color: colors.onSurface },
  recordsSub: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  shareNote: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginBottom: spacing.sm, lineHeight: 19 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  shareAvatar: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareAvatarText: { ...typography.titleLg, color: colors.primaryContainer, fontSize: 16 },
  shareName: { ...typography.labelMd, color: colors.onSurface },
  shareEmail: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  ownerBadge: {
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  ownerBadgeText: { ...typography.labelSm, color: colors.primaryContainer },
  memberBadge: {
    backgroundColor: colors.secondaryFixed,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  memberBadgeText: { ...typography.labelSm, color: colors.secondary },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.errorContainer,
    backgroundColor: '#fff1f0',
  },
  leaveBtnText: { ...typography.labelMd, color: colors.error },
  inviteError: { ...typography.labelSm, color: colors.error, marginTop: spacing.xs },
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

  // Vet share modal
  vetLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, marginBottom: spacing.xs },
  vetChips: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  vetChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  vetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  vetChipText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  vetLinkBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  vetLinkText: { ...typography.labelSm, color: colors.onSurface, flex: 1 },
  vetExpiryNote: { ...typography.labelSm, color: colors.onSurfaceVariant, marginBottom: spacing.sm },
  vetRevoke: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.md, paddingVertical: spacing.xs,
  },
  vetRevokeText: { ...typography.labelSm, color: colors.error },
  careArea: { minHeight: 64, paddingTop: spacing.sm, textAlignVertical: 'top' },
  careSaved: { ...typography.labelSm, color: colors.secondary, marginTop: spacing.sm },
  careWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  careWarnText: { ...typography.labelSm, color: colors.onSurfaceVariant, flex: 1 },
});
