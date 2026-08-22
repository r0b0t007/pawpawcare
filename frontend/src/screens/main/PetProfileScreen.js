import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  TextInput, Platform, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { resolveAsset } from '../../config';
import { convertWeight, weightInsight } from '../../utils/weight';
import { medicationStreak, medicationStreakLabel } from '../../utils/streaks';
import { useGamificationSummary, milestoneLabel } from '../../hooks/useGamification';
import { track } from '../../services/analytics';
import { ui, type, radii, PET_COLOR_PAIRS } from '../../theme';
import {
  Card, ListRow, StatusRing, StatusPill, Chip, SegmentedControl,
  Button, Sheet, ConfirmDialog, MilestoneRow, showToast,
} from '../../components';

// Redesign: segmented Overview / Health / Notes layout. Every data action from
// the old screen is preserved — weight add/delete, medications, foods,
// activities, expenses, sharing (co-owners, vet links, caretaker handoff),
// lost-pet reporting — just reorganized into the three segments.

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

const SEGMENTS = [
  { value: 'overview', label: 'Overview' },
  { value: 'health', label: 'Health' },
  { value: 'notes', label: 'Notes' },
];

const shortDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const fullDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const monthLabel = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

// Worst vaccination status wins — same logic as the pets list.
function petStatus(vax = []) {
  const overdueCount = vax.filter((v) => v.status === 'overdue').length;
  if (overdueCount > 0) return { status: 'overdue', label: `${overdueCount} overdue` };
  if (vax.some((v) => v.status === 'due_soon')) return { status: 'due', label: 'Due soon' };
  return { status: 'ok', label: 'All good' };
}

const vaxPill = (v) => (v.status === 'overdue'
  ? { status: 'overdue', label: 'Overdue' }
  : v.status === 'due_soon'
    ? { status: 'due', label: 'Due soon' }
    : { status: 'ok', label: 'Scheduled' });

export default function PetProfileScreen({ navigation, route }) {
  const { petId } = route.params;
  const {
    pets, myReports, medDoseDays, addFavoriteFood, removeFavoriteFood, addActivity,
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

  const [segment, setSegment] = useState('overview');

  // This pet's weekly care streak + earned milestones (nightly-computed).
  const { data: gamification } = useGamificationSummary();
  const careStreak = (gamification?.streaks || []).find((s) => s.pet_id === petId);
  const petMilestones = (gamification?.milestones || [])
    .filter((m) => m.pet_id === petId && milestoneLabel(m.key))
    .sort((a, b) => (b.earned_at || '').localeCompare(a.earned_at || ''));

  // Streak visibility, bucketed — never exact counts or med names (no PII).
  useEffect(() => {
    if (segment !== 'health' || !pet) return;
    const best = Math.max(0, ...(pet.medications || []).map(
      (m) => medicationStreak(medDoseDays?.[m.id], m)?.current || 0,
    ));
    if (best > 0) {
      const bucket = best <= 3 ? '1-3' : best <= 7 ? '4-7' : best <= 30 ? '8-30' : '30+';
      track('med_streak_viewed', { streak_bucket: bucket });
    }
  }, [segment]);

  const [foodSheet, setFoodSheet] = useState(false);
  const [activitySheet, setActivitySheet] = useState(false);
  const [medSheet, setMedSheet] = useState(false);
  const [lostSheet, setLostSheet] = useState(false);
  const [weightSheet, setWeightSheet] = useState(false);
  const [expenseSheet, setExpenseSheet] = useState(false);
  const [teamSheet, setTeamSheet] = useState(false);
  const [vetSheet, setVetSheet] = useState(false);

  const [newFood, setNewFood] = useState('');
  const [newActivity, setNewActivity] = useState({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: 'daily', times: ['08:00'], notes: '' });
  const [lostForm, setLostForm] = useState({ lastSeenLocation: '', description: '', contactPhone: '' });
  const [newWeight, setNewWeight] = useState({ value: '' });
  const [newExpense, setNewExpense] = useState({ category: 'vet', amount: '', notes: '' });
  const [share, setShare] = useState(null); // { owner, members, invites }
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Screen-level confirm (for actions triggered outside any sheet). Sheets
  // render their own nested ConfirmDialog so iOS doesn't drop the modal.
  const [confirm, setConfirm] = useState(null);
  const [teamConfirm, setTeamConfirm] = useState(null);
  const askConfirm = (cfg) => setConfirm(cfg);

  const loadShare = useCallback(async () => {
    const data = await getPetShare(petId);
    if (data) setShare(data);
  }, [getPetShare, petId]);

  useEffect(() => { loadShare(); }, [loadShare]);

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[type.body, { color: ui.sub }]}>Pet not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers (logic unchanged from the previous screen) ──

  const handleAddFood = async () => {
    if (!newFood.trim()) return;
    await addFavoriteFood(petId, newFood.trim());
    setNewFood('');
    showToast('Food added');
  };

  const handleRemoveFood = async (food) => {
    await removeFavoriteFood(petId, food.id);
    showToast('Food removed');
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
    setActivitySheet(false);
    showToast('Activity added');
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
    setMedSheet(false);
    showToast('Medication added');
  };

  const toggleMedTime = (t) => {
    setNewMed((m) => ({
      ...m,
      times: m.times.includes(t) ? m.times.filter((x) => x !== t) : [...m.times, t],
    }));
  };

  const handleLogDose = async (med) => {
    await logMedicationDose(petId, med.id);
    showToast('Dose logged', { celebrate: true, actionType: 'dose_logged' });
  };

  const handleDeleteMedication = (med) => askConfirm({
    title: 'Remove medication?',
    message: `${med.name} will no longer appear on ${pet.name}'s schedule.`,
    confirmLabel: 'Remove',
    destructive: true,
    action: async () => { await deleteMedication(petId, med.id); showToast('Medication removed'); },
  });

  const handleReportLost = async () => {
    await reportPetLost(petId, lostForm);
    setLostForm({ lastSeenLocation: '', description: '', contactPhone: '' });
    setLostSheet(false);
    showToast(`${pet.name} reported to the community board`);
  };

  const handleMarkFound = () => {
    if (!activeReport) return;
    askConfirm({
      title: 'Mark as found?',
      message: `Has ${pet.name} been found safe?`,
      confirmLabel: 'Found!',
      action: async () => { await resolveLostPet(activeReport.id); showToast('Welcome home!', { celebrate: true, actionType: 'lost_pet_found' }); },
    });
  };

  const handleAddWeight = async () => {
    const v = parseFloat(newWeight.value);
    if (!v || v <= 0) return;
    await addWeight(petId, { weight: v }); // unit is locked to the pet's unit server-side
    setNewWeight({ value: '' });
    setWeightSheet(false);
    showToast('Weight logged', { celebrate: true, actionType: 'weight_logged' });
  };

  const handleDeleteWeight = (w) => askConfirm({
    title: 'Delete entry?',
    message: `Remove the ${w.value.toFixed(1)} ${wUnit} entry?`,
    confirmLabel: 'Delete',
    destructive: true,
    action: async () => { await deleteWeight(petId, w.id); showToast('Entry deleted'); },
  });

  const handleAddExpense = async () => {
    const amt = parseFloat(newExpense.amount);
    if (!amt || amt <= 0) return;
    await addExpense(petId, { category: newExpense.category, amount: amt, notes: newExpense.notes.trim() || null });
    setNewExpense({ category: 'vet', amount: '', notes: '' });
    setExpenseSheet(false);
    showToast('Expense added');
  };

  const handleDeleteExpense = (e) => askConfirm({
    title: 'Delete expense?',
    message: `Remove this ${catMeta(e.category).label.toLowerCase()} expense?`,
    confirmLabel: 'Delete',
    destructive: true,
    action: async () => { await deleteExpense(petId, e.id); showToast('Expense deleted'); },
  });

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      await invitePetMember(petId, email);
      setInviteEmail('');
      await loadShare();
      showToast('Invite sent');
    } catch (err) {
      // Surface the server message (already a member, invalid email, …).
      setInviteError(err.message || 'Could not send the invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRemoveMember = (member) => setTeamConfirm({
    title: 'Remove co-owner?',
    message: `Remove ${member.name} from ${pet.name}?`,
    confirmLabel: 'Remove',
    destructive: true,
    action: async () => { await removePetMember(petId, member.id); await loadShare(); showToast('Co-owner removed'); },
  });

  const handleCancelInvite = (invite) => setTeamConfirm({
    title: 'Cancel invitation?',
    message: `Withdraw the invite to ${invite.email}?`,
    confirmLabel: 'Withdraw',
    destructive: true,
    action: async () => { await cancelPetInvite(petId, invite.id); await loadShare(); showToast('Invite withdrawn'); },
  });

  const handleLeave = () => setTeamConfirm({
    title: 'Leave pet?',
    message: `Stop co-owning ${pet.name}? You'll lose access to its records.`,
    confirmLabel: 'Leave',
    destructive: true,
    // Navigate away first so the pet vanishing from state can't flash a
    // "Pet not found" frame; the detach then completes in the background.
    action: () => { setTeamSheet(false); navigation.goBack(); leavePet(petId); },
  });

  // ── Derived data ──

  const vaccinations = pet.vaccinations || [];
  const upcoming = vaccinations.filter((v) => v.status !== 'completed');
  const completedVax = vaccinations.filter((v) => v.status === 'completed');
  const { status, label: statusLabel } = petStatus(vaccinations);

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

  const foods = pet.favoriteFoods || [];
  const meta = [
    pet.type ? cap(pet.type) : null,
    pet.breed || null,
    pet.age ? `${pet.age} yr${pet.age !== 1 ? 's' : ''}` : null,
    pet.gender ? cap(pet.gender) : null,
  ].filter(Boolean).join(' · ');

  const memberCount = (share?.members || []).length;
  const teamSummary = !share
    ? 'Loading…'
    : isOwner
      ? memberCount > 0
        ? `You + ${memberCount} co-owner${memberCount !== 1 ? 's' : ''}`
        : 'Just you — invite family to co-own'
      : `Shared with you${share.owner ? ` by ${share.owner.name}` : ''}`;

  const trendText = wInsight
    ? wInsight.direction === 'stable'
      ? 'Steady'
      : `${wInsight.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(wInsight.changeAbs).toFixed(1)} ${wUnit}`
    : null;
  const trendColor = wInsight && wInsight.direction === 'up' ? ui.subtle : ui.success;

  // ── Segments ──

  const renderOverview = () => (
    <View>
      {activeReport && (
        <Pressable style={({ pressed }) => [styles.lostBanner, pressed && { backgroundColor: '#fff7f6' }]} onPress={handleMarkFound}>
          <MaterialCommunityIcons name="map-marker-alert" size={20} color={ui.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lostTitle}>{pet.name} is reported lost</Text>
            <Text style={styles.lostSub}>Shared to the community board · tap to mark found</Text>
          </View>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={ui.success} />
        </Pressable>
      )}

      {/* Weight */}
      <Card padded style={[styles.block, { padding: 18, gap: 13 }]}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>
            {latestWeight ? `WEIGHT — ${latestWeight.value.toFixed(1)} ${wUnit.toUpperCase()}` : 'WEIGHT'}
          </Text>
          {trendText && <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>}
        </View>
        {normWeights.length > 0 ? (
          <>
            <WeightSparkline weights={normWeights} />
            {wInsight && <Text style={styles.insightText}>{wInsight.summary}</Text>}
            {wInsight?.notable && (
              <View style={styles.notableFlag}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={ui.warnText} />
                <Text style={styles.notableText}>Notable change — worth a vet check.</Text>
              </View>
            )}
            <View>
              {[...normWeights].reverse().slice(0, 4).map((w, i, arr) => (
                <View key={w.id} style={[styles.weightRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.weightRowVal}>{w.value.toFixed(1)} {wUnit}</Text>
                  <Text style={styles.weightRowDate}>{fullDate(w.loggedAt)}</Text>
                  <Pressable onPress={() => handleDeleteWeight(w)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={16} color={ui.faint} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>No weights logged yet.</Text>
        )}
        <Button variant="ghost" small icon="scale" label="Log weight" onPress={() => setWeightSheet(true)} />
      </Card>

      {/* Details */}
      <Card style={styles.block}>
        <ListRow
          icon="chip"
          title="Microchip"
          right={<Text style={styles.mono}>{pet.microchipped ? 'Registered' : 'Not recorded'}</Text>}
        />
        <ListRow
          icon="cake-variant-outline"
          title="Birthday"
          value={pet.birthday ? fullDate(pet.birthday) : 'Not set'}
        />
        <ListRow
          icon="food-drumstick-outline"
          title="Favorite foods"
          value={foods.length ? foods.map((f) => f.name).join(', ').slice(0, 28) : 'None yet'}
          chevron
          onPress={() => setFoodSheet(true)}
          last
        />
      </Card>

      {/* Care team & sharing */}
      <Card style={styles.block}>
        <ListRow
          icon="account-group-outline"
          title="Care team"
          subtitle={teamSummary}
          chevron
          onPress={() => { setInviteError(null); setTeamSheet(true); }}
        />
        <ListRow
          icon="share-variant-outline"
          title="Share with vet"
          subtitle={`Read-only link to ${pet.name}'s health summary`}
          chevron
          onPress={() => setVetSheet(true)}
        />
        <ListRow
          icon="home-heart"
          title="Caretaker handoff"
          subtitle="Sitter notes + a time-limited link"
          chevron
          onPress={() => setSegment('notes')}
          last
        />
      </Card>

      {/* Expenses */}
      <Text style={styles.sectionLabel}>Expenses</Text>
      <Card style={styles.block}>
        <View style={styles.spendRow}>
          <Text style={[type.rowTitle, { color: ui.ink, flex: 1 }]}>This month</Text>
          <Text style={styles.spendValue}>{thisMonthSpend.toFixed(2)}</Text>
        </View>
        {expenses.slice(0, 5).map((e) => {
          const m = catMeta(e.category);
          return (
            <View key={e.id} style={styles.itemRow}>
              <MaterialCommunityIcons name={m.icon} size={19} color={ui.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[type.rowTitle, { color: ui.ink }]}>
                  {m.label}{e.notes ? <Text style={[type.secondary, { color: ui.sub }]}>  ·  {e.notes}</Text> : null}
                </Text>
                <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>{fullDate(e.incurredOn)}</Text>
              </View>
              <Text style={styles.expenseAmount}>{Number(e.amount).toFixed(2)}</Text>
              <Pressable onPress={() => handleDeleteExpense(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={15} color={ui.faint} />
              </Pressable>
            </View>
          );
        })}
        <AddRow label="Add expense" onPress={() => setExpenseSheet(true)} />
      </Card>

      {!activeReport && (
        <Pressable
          style={({ pressed }) => [styles.reportLostBtn, pressed && { backgroundColor: '#fff7f6' }]}
          onPress={() => setLostSheet(true)}
        >
          <MaterialCommunityIcons name="map-marker-alert-outline" size={17} color={ui.danger} />
          <Text style={styles.reportLostText}>Report {pet.name} as lost</Text>
        </Pressable>
      )}
    </View>
  );

  const renderHealth = () => (
    <View>
      <Text style={styles.sectionLabel}>Upcoming</Text>
      <Card style={styles.block}>
        {upcoming.length === 0 && (
          <Text style={styles.emptyRowText}>Nothing scheduled — enjoy the calm.</Text>
        )}
        {upcoming.map((v) => {
          const p = vaxPill(v);
          return (
            <ListRow
              key={v.id}
              title={v.name}
              subtitle={`Due ${fullDate(v.dueDate) || '—'}`}
              right={<StatusPill status={p.status} label={p.label} />}
              onPress={() => navigation.navigate('VaccinationTracker', { petId })}
            />
          );
        })}
        <ListRow
          icon="needle"
          title="Vaccination tracker"
          subtitle="Add, complete or edit vaccinations"
          chevron
          onPress={() => navigation.navigate('VaccinationTracker', { petId })}
          last
        />
      </Card>

      <Text style={styles.sectionLabel}>Medications</Text>
      <Card style={styles.block}>
        {(pet.medications || []).length === 0 && (
          <Text style={styles.emptyRowText}>No medications yet.</Text>
        )}
        {(pet.medications || []).map((med) => (
          <MedicationRow
            key={med.id}
            med={med}
            streakLabel={medicationStreakLabel(medicationStreak(medDoseDays?.[med.id], med))}
            onLog={() => handleLogDose(med)}
            onDelete={() => handleDeleteMedication(med)}
          />
        ))}
        <AddRow label="Add medication" onPress={() => setMedSheet(true)} />
      </Card>

      {completedVax.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>History</Text>
          <Card style={styles.block}>
            {completedVax.slice(0, 6).map((v, i, arr) => (
              <View key={v.id} style={[styles.historyRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <MaterialCommunityIcons name="check-circle" size={18} color={ui.ringOk} />
                <Text style={styles.historyTitle}>{v.name}</Text>
                <Text style={styles.historyDate}>
                  {v.administeredDate ? shortDate(v.administeredDate) : shortDate(v.dueDate)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {petMilestones.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Milestones</Text>
          {careStreak?.current_weeks > 0 && (
            <Text style={[type.secondary, { color: ui.accent, marginBottom: 8, fontFamily: 'PlusJakartaSans_600SemiBold' }]}>
              {careStreak.current_weeks} week{careStreak.current_weeks === 1 ? '' : 's'} of consistent care
            </Text>
          )}
          <Card padded style={styles.block}>
            {petMilestones.map((m, i, arr) => (
              <MilestoneRow
                key={m.id}
                label={milestoneLabel(m.key)}
                earnedAt={m.earned_at}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        </>
      )}

      <Card style={styles.block}>
        <ListRow
          icon="folder-heart-outline"
          title="Medical records"
          subtitle="Vet clinics, appointments & documents"
          chevron
          onPress={() => navigation.navigate('MedicalRecords', { petId, petName: pet.name })}
          last
        />
      </Card>
    </View>
  );

  const renderNotes = () => (
    <View>
      <Text style={styles.sectionLabel}>Daily routine</Text>
      <Card style={styles.block}>
        {(pet.activities || []).length === 0 && (
          <Text style={styles.emptyRowText}>No daily activities yet.</Text>
        )}
        {(pet.activities || []).map((act) => (
          <ActivityRow key={act.id} activity={act} />
        ))}
        <AddRow label="Add activity" onPress={() => setActivitySheet(true)} />
      </Card>

      <Text style={styles.sectionLabel}>Caretaker notes</Text>
      <CareNotesPanel
        petName={pet.name}
        onLoad={() => getCareProfile(petId)}
        onSaveNotes={(data) => saveCareProfile(petId, data)}
        onCreate={(expiresIn) => createCareLink(petId, expiresIn)}
        onRevoke={() => revokeCareLinks(petId)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.topRow}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('EditPet', { petId })} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <StatusRing
            size={84}
            color={pet.color || ui.accentTint}
            textColor={petFg(pet.color)}
            initial={pet.name[0]}
            photo={pet.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined}
            status={status}
          />
          <Text style={styles.petName}>{pet.name}</Text>
          {meta ? <Text style={styles.petMeta}>{meta}</Text> : null}
          <StatusPill status={status} label={statusLabel} />
        </View>

        <SegmentedControl
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          style={styles.segmented}
        />

        {segment === 'overview' && renderOverview()}
        {segment === 'health' && renderHealth()}
        {segment === 'notes' && renderNotes()}
      </ScrollView>

      {/* ── Sheets ── */}

      {/* Favorite foods */}
      <Sheet visible={foodSheet} onClose={() => { setFoodSheet(false); setNewFood(''); }} title="Favorite foods">
        {foods.length > 0 && (
          <View style={styles.foodWrap}>
            {foods.map((food) => (
              <View key={food.id} style={styles.foodChip}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={13} color={ui.accent} />
                <Text style={styles.foodChipText}>{food.name}</Text>
                <Pressable onPress={() => handleRemoveFood(food)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialCommunityIcons name="close" size={13} color={ui.faint} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inlineAddRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="e.g. Salmon kibble"
            placeholderTextColor={ui.subtle}
            value={newFood}
            onChangeText={setNewFood}
          />
          <Pressable style={styles.inlineAddBtn} onPress={handleAddFood}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          </Pressable>
        </View>
      </Sheet>

      {/* Add activity */}
      <Sheet visible={activitySheet} onClose={() => setActivitySheet(false)} title="Add activity">
        <TextInput
          style={styles.input}
          placeholder="Activity name (e.g. Park walk)"
          placeholderTextColor={ui.subtle}
          value={newActivity.name}
          onChangeText={(v) => setNewActivity({ ...newActivity, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Duration in minutes"
          placeholderTextColor={ui.subtle}
          value={newActivity.duration}
          onChangeText={(v) => setNewActivity({ ...newActivity, duration: v })}
          keyboardType="number-pad"
        />
        <View style={styles.chipWrap}>
          {['morning', 'afternoon', 'evening'].map((t) => (
            <Chip
              key={t}
              label={cap(t)}
              active={newActivity.timeOfDay === t}
              onPress={() => setNewActivity({ ...newActivity, timeOfDay: t })}
            />
          ))}
        </View>
        <Button label="Add activity" onPress={handleAddActivity} disabled={!newActivity.name.trim()} />
      </Sheet>

      {/* Add medication */}
      <Sheet visible={medSheet} onClose={() => setMedSheet(false)} title="Add medication">
        <TextInput
          style={styles.input}
          placeholder="Name (e.g. Apoquel)"
          placeholderTextColor={ui.subtle}
          value={newMed.name}
          onChangeText={(v) => setNewMed({ ...newMed, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Dosage (e.g. 5mg, 1 tablet)"
          placeholderTextColor={ui.subtle}
          value={newMed.dosage}
          onChangeText={(v) => setNewMed({ ...newMed, dosage: v })}
        />
        <View>
          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipWrap}>
            {['daily', 'weekly', 'monthly', 'as_needed'].map((f) => (
              <Chip
                key={f}
                label={f === 'as_needed' ? 'As needed' : cap(f)}
                active={newMed.frequency === f}
                onPress={() => setNewMed({ ...newMed, frequency: f })}
              />
            ))}
          </View>
        </View>
        {newMed.frequency !== 'as_needed' && (
          <View>
            <Text style={styles.fieldLabel}>Dose times</Text>
            <View style={styles.chipWrap}>
              {[['Morning', '08:00'], ['Noon', '12:00'], ['Evening', '18:00'], ['Night', '22:00']].map(([label, t]) => (
                <Chip key={t} label={label} active={newMed.times.includes(t)} onPress={() => toggleMedTime(t)} />
              ))}
            </View>
          </View>
        )}
        <Button label="Add medication" onPress={handleAddMedication} disabled={!newMed.name.trim()} />
      </Sheet>

      {/* Report lost */}
      <Sheet visible={lostSheet} onClose={() => setLostSheet(false)} title={`Report ${pet.name} as lost`}>
        <Text style={styles.sheetHint}>This shares an alert to the community Lost Pets board.</Text>
        <TextInput
          style={styles.input}
          placeholder="Last seen location (e.g. Riverside Park)"
          placeholderTextColor={ui.subtle}
          value={lostForm.lastSeenLocation}
          onChangeText={(v) => setLostForm({ ...lostForm, lastSeenLocation: v })}
        />
        <TextInput
          style={[styles.input, styles.inputArea]}
          placeholder="Details (color, collar, temperament…)"
          placeholderTextColor={ui.subtle}
          value={lostForm.description}
          onChangeText={(v) => setLostForm({ ...lostForm, description: v })}
          multiline
        />
        <TextInput
          style={styles.input}
          placeholder="Contact phone"
          placeholderTextColor={ui.subtle}
          value={lostForm.contactPhone}
          onChangeText={(v) => setLostForm({ ...lostForm, contactPhone: v })}
          keyboardType="phone-pad"
        />
        <Button variant="danger" label="Report lost" onPress={handleReportLost} />
      </Sheet>

      {/* Log weight */}
      <Sheet visible={weightSheet} onClose={() => setWeightSheet(false)} title={`Log ${pet.name}'s weight`}>
        <View style={styles.inlineAddRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="e.g. 22.5"
            placeholderTextColor={ui.subtle}
            value={newWeight.value}
            onChangeText={(v) => setNewWeight({ value: v })}
            keyboardType="decimal-pad"
          />
          <View style={styles.unitBox}>
            <Text style={styles.unitText}>{wUnit}</Text>
          </View>
        </View>
        <Text style={styles.sheetHint}>Logged in {wUnit} — change the unit in Edit Pet.</Text>
        <Button label="Log weight" onPress={handleAddWeight} disabled={!parseFloat(newWeight.value)} />
      </Sheet>

      {/* Add expense */}
      <Sheet visible={expenseSheet} onClose={() => setExpenseSheet(false)} title={`Add expense for ${pet.name}`}>
        <View>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipWrap}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                active={newExpense.category === c.id}
                onPress={() => setNewExpense({ ...newExpense, category: c.id })}
              />
            ))}
          </View>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 45.00)"
          placeholderTextColor={ui.subtle}
          value={newExpense.amount}
          onChangeText={(v) => setNewExpense({ ...newExpense, amount: v })}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor={ui.subtle}
          value={newExpense.notes}
          onChangeText={(v) => setNewExpense({ ...newExpense, notes: v })}
        />
        <Button label="Add expense" onPress={handleAddExpense} disabled={!parseFloat(newExpense.amount)} />
      </Sheet>

      {/* Care team (owner list + invite / leave) */}
      <Sheet
        visible={teamSheet}
        onClose={() => { setTeamSheet(false); setInviteEmail(''); setInviteError(null); }}
        title="Care team"
      >
        {share?.owner && (
          <View style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>{(share.owner.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.rowTitle, { color: ui.ink }]}>
                {share.owner.name}{share.owner.id === user?.id ? ' (You)' : ''}
              </Text>
              <Text style={[type.secondary, { color: ui.sub }]}>{share.owner.email}</Text>
            </View>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>Owner</Text></View>
          </View>
        )}
        {(share?.members || []).map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>{(m.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.rowTitle, { color: ui.ink }]}>{m.name}{m.id === user?.id ? ' (You)' : ''}</Text>
              <Text style={[type.secondary, { color: ui.sub }]}>{m.email}</Text>
            </View>
            {isOwner ? (
              <Pressable onPress={() => handleRemoveMember(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={18} color={ui.faint} />
              </Pressable>
            ) : (
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>Co-owner</Text></View>
            )}
          </View>
        ))}
        {isOwner && (share?.invites || []).map((inv) => (
          <View key={inv.id} style={styles.memberRow}>
            <View style={[styles.memberAvatar, { backgroundColor: ui.track }]}>
              <MaterialCommunityIcons name="email-outline" size={17} color={ui.subtle} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.rowTitle, { color: ui.ink }]}>{inv.email}</Text>
              <Text style={[type.secondary, { color: ui.sub }]}>Invitation pending</Text>
            </View>
            <Pressable onPress={() => handleCancelInvite(inv)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={18} color={ui.faint} />
            </Pressable>
          </View>
        ))}

        {isOwner ? (
          <>
            <Text style={styles.sheetHint}>
              Invite someone by email to co-own {pet.name}. They can view and update records, but only you can delete the pet.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="family@example.com"
              placeholderTextColor={ui.subtle}
              value={inviteEmail}
              onChangeText={(v) => { setInviteEmail(v); setInviteError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!inviteError && <Text style={styles.errorText}>{inviteError}</Text>}
            <Button
              label={inviteBusy ? 'Sending…' : 'Send invite'}
              onPress={handleInvite}
              disabled={inviteBusy || !inviteEmail.trim()}
            />
          </>
        ) : (
          <>
            <Text style={styles.sheetHint}>
              Shared with you{share?.owner ? ` by ${share.owner.name}` : ''}. You can view and update {pet.name}'s records.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.dangerOutlineBtn, pressed && { backgroundColor: '#fff7f6' }]}
              onPress={handleLeave}
            >
              <MaterialCommunityIcons name="exit-to-app" size={16} color={ui.danger} />
              <Text style={styles.dangerOutlineText}>Leave this pet</Text>
            </Pressable>
          </>
        )}

        {/* Nested so iOS keeps it above this sheet's modal. */}
        <ConfirmDialog
          visible={!!teamConfirm}
          title={teamConfirm?.title}
          message={teamConfirm?.message}
          confirmLabel={teamConfirm?.confirmLabel}
          destructive={teamConfirm?.destructive}
          onCancel={() => setTeamConfirm(null)}
          onConfirm={() => { const a = teamConfirm?.action; setTeamConfirm(null); a?.(); }}
        />
      </Sheet>

      <VetShareSheet
        visible={vetSheet}
        petName={pet.name}
        onClose={() => setVetSheet(false)}
        onCreate={(expiresIn) => createShareLink(petId, expiresIn)}
        onRevoke={() => revokeShareLinks(petId)}
      />

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const a = confirm?.action; setConfirm(null); a?.(); }}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ──

// Simple bar sparkline: past bars in tint, latest in accent, heights normalized.
function WeightSparkline({ weights }) {
  const data = weights.slice(-6);
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  return (
    <View>
      <View style={styles.sparkRow}>
        {data.map((d, i) => {
          const t = range > 0 ? (d.value - min) / range : 0.5;
          const h = Math.round(14 + t * 28); // 14–42px
          return (
            <View
              key={d.id}
              style={[styles.sparkBar, { height: h }, i === data.length - 1 && { backgroundColor: ui.accent }]}
            />
          );
        })}
      </View>
      <View style={styles.sparkLabels}>
        {data.map((d) => (
          <Text key={d.id} style={styles.sparkLabel}>{monthLabel(d.loggedAt)}</Text>
        ))}
      </View>
    </View>
  );
}

function MedicationRow({ med, streakLabel, onLog, onDelete }) {
  const freqLabel = med.frequency === 'as_needed'
    ? 'As needed'
    : `${cap(med.frequency)}${med.times?.length ? ` · ${med.times.join(', ')}` : ''}`;
  const lastGiven = med.lastAdministeredAt
    ? new Date(med.lastAdministeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.itemRow, !med.active && { opacity: 0.55 }]}>
      <MaterialCommunityIcons name="pill" size={19} color={ui.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.rowTitle, { color: ui.ink }]}>
          {med.name}{med.dosage ? <Text style={[type.secondary, { color: ui.sub }]}>  ·  {med.dosage}</Text> : null}
        </Text>
        <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>{freqLabel}</Text>
        {lastGiven && <Text style={[type.secondary, { color: ui.subtle, marginTop: 1 }]}>Last given: {lastGiven}</Text>}
        {/* Daily-med streak — supplementary care-consistency line, not a health
            status (StatusRing/StatusPill stay the only status renderers). */}
        {streakLabel && (
          <Text style={[type.secondary, { color: ui.accent, marginTop: 1, fontFamily: 'PlusJakartaSans_600SemiBold' }]}>
            {streakLabel}
          </Text>
        )}
      </View>
      <Button pill small label="Log" onPress={onLog} />
      <Pressable onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
        <MaterialCommunityIcons name="close" size={16} color={ui.faint} />
      </Pressable>
    </View>
  );
}

function ActivityRow({ activity }) {
  const timeIcons = { morning: 'weather-sunny', afternoon: 'weather-partly-cloudy', evening: 'weather-night' };
  return (
    <View style={styles.itemRow}>
      <MaterialCommunityIcons name={timeIcons[activity.timeOfDay] || 'run'} size={19} color={ui.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.rowTitle, { color: ui.ink }]}>{activity.name}</Text>
        <Text style={[type.secondary, { color: ui.sub, marginTop: 1, textTransform: 'capitalize' }]}>
          {activity.duration} min · {activity.timeOfDay}
        </Text>
      </View>
    </View>
  );
}

// Dashed "add" row at the bottom of a card.
function AddRow({ label, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.addRow, pressed && { backgroundColor: '#fffdf8' }]} onPress={onPress}>
      <MaterialCommunityIcons name="plus" size={17} color={ui.accent} />
      <Text style={styles.addRowText}>{label}</Text>
    </Pressable>
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
function VetShareSheet({ visible, petName, onClose, onCreate, onRevoke }) {
  const [expiresIn, setExpiresIn] = useState('24h');
  const [link, setLink] = useState(null); // { url, expires_at }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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

  const revoke = async () => {
    setConfirmRevoke(false);
    setBusy(true); setError(null);
    try { await onRevoke(); setLink(null); showToast('All share links revoked'); }
    catch (e) { setError(e.message || 'Could not revoke links.'); }
    finally { setBusy(false); }
  };

  const expiry = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <Sheet visible={visible} onClose={close} title="Share with vet">
      <Text style={styles.sheetHint}>
        Creates a read-only web link to {petName}'s vaccinations, medications, weight, and recent documents. No account needed to open it.
      </Text>

      {!link ? (
        <>
          <View>
            <Text style={styles.fieldLabel}>Link expires after</Text>
            <View style={styles.chipWrap}>
              {VET_EXPIRIES.map((e) => (
                <Chip key={e.id} label={e.label} active={expiresIn === e.id} onPress={() => setExpiresIn(e.id)} />
              ))}
            </View>
          </View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Button label={busy ? 'Creating…' : 'Create & share'} onPress={create} disabled={busy} />
        </>
      ) : (
        <>
          <View style={styles.linkBox}>
            <MaterialCommunityIcons name="link-variant" size={16} color={ui.accent} />
            <Text style={styles.linkText} numberOfLines={1}>{link.url}</Text>
          </View>
          <Text style={styles.linkExpiry}>Expires {expiry(link.expires_at)}</Text>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="ghost" label="Share again" onPress={reshare} style={{ flex: 1 }} />
            <Button label="Done" onPress={close} style={{ flex: 1 }} />
          </View>
        </>
      )}

      <Pressable style={styles.revokeBtn} onPress={() => setConfirmRevoke(true)} disabled={busy}>
        <MaterialCommunityIcons name="link-off" size={15} color={ui.danger} />
        <Text style={styles.revokeText}>Revoke all active links</Text>
      </Pressable>

      <ConfirmDialog
        visible={confirmRevoke}
        title="Revoke links?"
        message={`Disable every share link for ${petName}? Anyone holding one will lose access.`}
        confirmLabel="Revoke"
        destructive
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={revoke}
      />
    </Sheet>
  );
}

const CARE_EXPIRIES = [
  { id: '1d', label: '1 day' },
  { id: '3d', label: '3 days' },
  { id: '7d', label: '1 week' },
  { id: '14d', label: '2 weeks' },
];

// Caretaker handoff, now inline in the Notes segment: edit the sitter notes,
// then generate a time-limited read-only link. Notes are saved before minting
// so the link always reflects the latest edits. A failed load must not present
// an editable blank form — saving it would overwrite real notes with nulls —
// so editing stays locked until a load succeeds.
function CareNotesPanel({ petName, onLoad, onSaveNotes, onCreate, onRevoke }) {
  const [form, setForm] = useState({ feeding: '', instructions: '', emergency_name: '', emergency_phone: '' });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [expiresIn, setExpiresIn] = useState('7d');
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bind = (key) => ({
    value: form[key],
    onChangeText: (v) => { setForm({ ...form, [key]: v }); setSavedOk(false); },
    placeholderTextColor: ui.subtle,
    editable: !loadFailed && !loading,
  });

  const payload = () => ({
    feeding: form.feeding.trim() || null,
    instructions: form.instructions.trim() || null,
    emergency_name: form.emergency_name.trim() || null,
    emergency_phone: form.emergency_phone.trim() || null,
  });

  const saveNotes = async () => {
    setBusy(true); setError(null);
    try { await onSaveNotes(payload()); setSavedOk(true); showToast('Notes saved'); }
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

  const revoke = async () => {
    setConfirmRevoke(false);
    setBusy(true); setError(null);
    try { await onRevoke(); setLink(null); showToast('All caretaker links revoked'); }
    catch (e) { setError(e.message || 'Could not revoke links.'); } finally { setBusy(false); }
  };

  const expiry = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  return (
    <Card padded style={[styles.block, { padding: 18, gap: 14 }]}>
      <Text style={styles.sheetHint}>
        Notes for whoever looks after {petName}, plus a read-only link you can text them — no app needed.
      </Text>

      {loading ? (
        <ActivityIndicator color={ui.accent} style={{ paddingVertical: 24 }} />
      ) : loadFailed ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <Text style={styles.errorText}>Couldn't load the saved notes — editing is paused so they don't get overwritten.</Text>
          <Button variant="ghost" small label="Try again" onPress={load} />
        </View>
      ) : (
        <>
          <View>
            <Text style={styles.fieldLabel}>Feeding</Text>
            <TextInput
              style={[styles.input, styles.inputArea]}
              multiline
              placeholder="e.g. 1 cup of kibble at 8am & 6pm, fresh water daily"
              {...bind('feeding')}
            />
          </View>
          <View>
            <Text style={styles.fieldLabel}>Instructions</Text>
            <TextInput
              style={[styles.input, styles.inputArea]}
              multiline
              placeholder="Litter box, walks, meds, quirks…"
              {...bind('instructions')}
            />
          </View>
          <View style={styles.careWarn}>
            <MaterialCommunityIcons name="shield-alert-outline" size={13} color={ui.subtle} />
            <Text style={styles.careWarnText}>
              Anyone with the link can read this — skip door codes or alarm PINs, or pick a short expiry.
            </Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>Emergency contact</Text>
            <TextInput style={styles.input} placeholder="Name (e.g. Dr. Meow at Happy Paws)" {...bind('emergency_name')} />
            <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Phone" keyboardType="phone-pad" {...bind('emergency_phone')} />
          </View>

          {link ? (
            <>
              <View style={styles.linkBox}>
                <MaterialCommunityIcons name="link-variant" size={16} color={ui.accent} />
                <Text style={styles.linkText} numberOfLines={1}>{link.url}</Text>
              </View>
              <Text style={styles.linkExpiry}>Expires {expiry(link.expires_at)}</Text>
              <Button variant="ghost" label="Share again" onPress={reshare} />
            </>
          ) : (
            <View>
              <Text style={styles.fieldLabel}>Link expires after</Text>
              <View style={styles.chipWrap}>
                {CARE_EXPIRIES.map((e) => (
                  <Chip key={e.id} label={e.label} active={expiresIn === e.id} onPress={() => setExpiresIn(e.id)} />
                ))}
              </View>
            </View>
          )}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {savedOk && !link && <Text style={styles.savedText}>Notes saved ✓</Text>}

          {!link && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                variant="ghost"
                label={busy ? '…' : 'Save notes'}
                onPress={saveNotes}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <Button
                label={busy ? 'Working…' : 'Create & share'}
                onPress={createAndShare}
                disabled={busy}
                style={{ flex: 1 }}
              />
            </View>
          )}
          <Pressable style={styles.revokeBtn} onPress={() => setConfirmRevoke(true)} disabled={busy}>
            <MaterialCommunityIcons name="link-off" size={15} color={ui.danger} />
            <Text style={styles.revokeText}>Revoke all active links</Text>
          </Pressable>
        </>
      )}

      <ConfirmDialog
        visible={confirmRevoke}
        title="Revoke links?"
        message={`Disable every caretaker link for ${petName}? Anyone holding one will lose access.`}
        confirmLabel="Revoke"
        destructive
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={revoke}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
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
  editLink: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.accent },
  identity: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  petName: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 25,
    letterSpacing: -0.4,
    color: ui.ink,
  },
  petMeta: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: ui.sub },
  segmented: { marginHorizontal: 24, marginBottom: 20 },

  block: { marginHorizontal: 24, marginBottom: 18 },
  sectionLabel: {
    ...type.sectionLabel,
    color: ui.subtle,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { ...type.sectionLabel, color: ui.subtle },
  trendText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  insightText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12.5, color: ui.sub },
  notableFlag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notableText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: ui.warnText, flex: 1 },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 42 },
  sparkBar: {
    flex: 1,
    backgroundColor: '#f0e2cd',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  sparkLabels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  sparkLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    color: '#a08d72',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  weightRowVal: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: ui.ink, width: 84 },
  weightRowDate: { ...type.secondary, color: ui.sub, flex: 1 },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12.5,
    color: ui.sub,
  },
  emptyText: { ...type.body, fontSize: 13, color: ui.subtle },
  emptyRowText: {
    padding: 18,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: ui.subtle,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
  },
  addRowText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  spendValue: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: ui.ink },
  expenseAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: ui.hairline,
  },
  historyTitle: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13.5, color: ui.ink },
  historyDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle },
  lostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginHorizontal: 24,
    marginBottom: 18,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: ui.surface,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
    borderRadius: radii.card,
    borderCurve: 'continuous',
  },
  lostTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
  lostSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  reportLostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 28,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
    borderCurve: 'continuous',
  },
  reportLostText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.danger },
  dangerOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
    borderCurve: 'continuous',
  },
  dangerOutlineText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.danger },

  // Sheet form bits
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
  inputArea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },
  fieldLabel: { ...type.sectionLabel, color: ui.subtle, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetHint: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12.5, lineHeight: 18, color: ui.sub },
  errorText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.danger },
  savedText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.success },
  inlineAddRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  inlineAddBtn: {
    width: 46,
    borderRadius: radii.control,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBox: {
    paddingHorizontal: 18,
    borderRadius: radii.control,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13.5, color: ui.accent },
  foodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ui.background,
    borderWidth: 1,
    borderColor: ui.controlBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  foodChipText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: ui.accent },
  roleBadge: {
    backgroundColor: ui.track,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roleBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: ui.subtle },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ui.background,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  linkText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: ui.ink, flex: 1 },
  linkExpiry: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.subtle },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  revokeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.danger },
  careWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  careWarnText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11.5, lineHeight: 16, color: ui.subtle, flex: 1 },
});
