import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  TextInput, Platform, Share, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation, FadeIn, FadeOut, LinearTransition, interpolate,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { petPhoto } from '../../utils/pets';
import { dosesPerDay, dosesTakenOn } from '../../utils/doses';
import { convertWeight, weightInsight } from '../../utils/weight';
import { medicationStreak, medicationStreakLabel, dayKey } from '../../utils/streaks';
import { fmtFull, fmtMonth, fmtShort, fmtTime, parseDay } from '../../utils/dates';
import { useGamificationSummary, milestoneLabel } from '../../hooks/useGamification';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useToday } from '../../hooks/useToday';
import { useInFlight } from '../../hooks/useInFlight';
import { track } from '../../services/analytics';
import { ui, type, radii, motion, petPair, scrim } from '../../theme';
import {
  Card, ListRow, StatusPill, Chip, SegmentedControl, StepProgress,
  Button, Sheet, ConfirmDialog, MilestoneRow, showToast, speciesIcon, petHealthStatus,
} from '../../components';

// "Lively & Light" profile: a full-bleed photo hero (or the pet's identity
// tint + species glyph when there's no photo — never stock imagery), then a
// cream sheet with Today's care first and four summary tiles that open the
// detail (progressive disclosure). Destructive and rarely-used actions live
// in the ••• menu. Every data action from the old screen is preserved —
// weight add/delete, medications, foods, activities, expenses, sharing
// (co-owners, vet links, caretaker handoff), lost-pet reporting.

// Motion builders live at module scope — rebuilt-in-render builders cost
// every re-render.
const SEGMENT_IN = FadeIn.duration(150);
const ROW_OUT = FadeOut.duration(150);
const ROW_LAYOUT = LinearTransition.duration(200);

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

// '' for a missing date (callers supply their own fallback text).
const shortDate = (iso) => (iso ? fmtShort(parseDay(iso)) : '');
const fullDate = (iso) => (iso ? fmtFull(parseDay(iso)) : '');
const monthLabel = (iso) => (iso ? fmtMonth(parseDay(iso)) : '');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const HERO_HEIGHT = 400;

const vaxPill = (v) => (v.status === 'overdue'
  ? { status: 'overdue', label: 'Overdue' }
  : v.status === 'due_soon'
    ? { status: 'due', label: 'Due soon' }
    : { status: 'ok', label: 'Scheduled' });

// Stable fallback so the weight memos don't recompute for pets with no entries.
const NO_WEIGHTS = [];

export default function PetProfileScreen({ navigation, route }) {
  const { petId } = route.params;
  const {
    pets, myReports, medDoseDays, medDoseCounts, addFavoriteFood, removeFavoriteFood, addActivity,
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
  const insets = useSafeAreaInsets();

  // This pet's weekly care streak + earned milestones (nightly-computed).
  const { data: gamification, refetch: refetchGamification, isStale: gamificationStale } = useGamificationSummary();
  useRefetchOnFocus(refetchGamification, { isStale: gamificationStale });
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
  const [menuSheet, setMenuSheet] = useState(false);

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
  // "Today" rolls over at midnight / on refocus (the profile can stay open in
  // the stack), and doses in flight (see handleLogDose) — both declared above
  // the early return.
  const today = useToday();
  // Status-bar backdrop: once the photo hero scrolls away, content would slide
  // under the clock and icons — fade in a cream strip behind the status bar
  // (UI-thread scroll handler, no re-render per frame).
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const statusBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO_HEIGHT - 60, HERO_HEIGHT - 20], [0, 1], Extrapolation.CLAMP),
  }));
  const { run, isBusy } = useInFlight();
  const askConfirm = (cfg) => setConfirm(cfg);

  const loadShare = useCallback(async () => {
    const data = await getPetShare(petId);
    if (data) setShare(data);
  }, [getPetShare, petId]);

  useEffect(() => { loadShare(); }, [loadShare]);

  // Hooks must run on every render, so these sit above the `!pet` early
  // return: the profile stays mounted while a deleted/left pet is popped, and
  // first renders before pets load — a conditional hook count crashes React.
  const weights = pet?.weights ?? NO_WEIGHTS;
  const wUnit = pet?.weightUnit || 'kg';
  // Normalize every entry to the pet's current unit before charting/trend.
  const normWeights = useMemo(
    () => weights.map((w) => ({ id: w.id, loggedAt: w.loggedAt, value: convertWeight(w.weight, w.unit, wUnit) })),
    [weights, wUnit],
  );
  const wInsight = useMemo(() => weightInsight(normWeights, wUnit), [normWeights, wUnit]);

  if (!pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[type.body, { color: ui.sub }]}>Pet not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Handlers ──

  // Every save goes through here: one request per tap (useInFlight — a
  // double tap never saves twice), and the success copy (plus clearing the
  // form / closing the sheet) only for what the server actually saved. On a
  // failure the form stays as typed and the user gets a retry message.
  const save = (key, request, { ok, okOptions, fail, then }) =>
    run(key, async () => {
      if (await request()) {
        then?.();
        if (ok) showToast(ok, okOptions);
      } else {
        showToast(fail);
      }
    });

  const handleAddFood = () => {
    if (!newFood.trim()) return undefined;
    return save('food', () => addFavoriteFood(petId, newFood.trim()), {
      ok: 'Food added',
      fail: "Couldn't add that food. Try again.",
      then: () => setNewFood(''),
    });
  };

  // Deletes only behind a confirm, like every other × on this screen.
  const handleRemoveFood = (food) => askConfirm({
    title: 'Remove food?',
    message: `Remove ${food.name} from ${pet.name}'s favorite foods?`,
    confirmLabel: 'Remove',
    destructive: true,
    action: () => save(`food-${food.id}`, () => removeFavoriteFood(petId, food.id), {
      ok: 'Food removed',
      fail: "Couldn't remove that food. Try again.",
    }),
  });

  const handleAddActivity = () => {
    if (!newActivity.name.trim()) return undefined;
    return save('activity', () => addActivity(petId, {
      name: newActivity.name.trim(),
      duration: parseInt(newActivity.duration) || 30,
      timeOfDay: newActivity.timeOfDay,
      icon: newActivity.icon,
    }), {
      ok: 'Activity added',
      fail: "Couldn't add the activity. Try again.",
      then: () => {
        setNewActivity({ name: '', duration: '', timeOfDay: 'morning', icon: 'run' });
        setActivitySheet(false);
      },
    });
  };

  const handleAddMedication = () => {
    if (!newMed.name.trim()) return undefined;
    const asNeeded = newMed.frequency === 'as_needed';
    return save('medication', () => addMedication(petId, {
      name: newMed.name.trim(),
      dosage: newMed.dosage.trim() || null,
      frequency: newMed.frequency,
      times: asNeeded ? [] : (newMed.times.length ? [...newMed.times].sort() : ['08:00']),
      notes: newMed.notes.trim() || null,
    }), {
      ok: 'Medication added',
      fail: "Couldn't add the medication. Try again.",
      then: () => {
        setNewMed({ name: '', dosage: '', frequency: 'daily', times: ['08:00'], notes: '' });
        setMedSheet(false);
      },
    });
  };

  const toggleMedTime = (t) => {
    setNewMed((m) => ({
      ...m,
      times: m.times.includes(t) ? m.times.filter((x) => x !== t) : [...m.times, t],
    }));
  };

  // One tap, one dose: the button is disabled while its dose is in flight,
  // and the celebration only follows a dose the server actually saved.
  const handleLogDose = (med) =>
    run(med.id, async () => {
      const saved = await logMedicationDose(petId, med.id);
      if (saved) showToast('Dose logged', { celebrate: true, actionType: 'dose_logged' });
      else showToast(`Couldn't log ${med.name}. Try again.`);
    });

  const handleDeleteMedication = (med) => askConfirm({
    title: 'Remove medication?',
    message: `${med.name} will no longer appear on ${pet.name}'s schedule.`,
    confirmLabel: 'Remove',
    destructive: true,
    action: () => save(`med-del-${med.id}`, () => deleteMedication(petId, med.id), {
      ok: 'Medication removed',
      fail: "Couldn't remove the medication. Try again.",
    }),
  });

  // A double tap here would post two public reports — the guard matters most.
  const handleReportLost = () =>
    save('report-lost', () => reportPetLost(petId, lostForm), {
      ok: `${pet.name} reported to the community board`,
      fail: `Couldn't report ${pet.name}. Check your connection and try again.`,
      then: () => {
        setLostForm({ lastSeenLocation: '', description: '', contactPhone: '' });
        setLostSheet(false);
      },
    });

  const handleMarkFound = () => {
    if (!activeReport) return;
    askConfirm({
      title: 'Mark as found?',
      message: `Has ${pet.name} been found safe?`,
      confirmLabel: 'Found!',
      action: () => save('found', () => resolveLostPet(activeReport.id), {
        ok: 'Welcome home!',
        okOptions: { celebrate: true, actionType: 'lost_pet_found' },
        fail: "Couldn't mark them found. Try again.",
      }),
    });
  };

  const handleAddWeight = () => {
    const v = parseFloat(newWeight.value);
    if (!v || v <= 0) return undefined;
    // Unit is locked to the pet's unit server-side.
    return save('weight', () => addWeight(petId, { weight: v }), {
      ok: 'Weight logged',
      okOptions: { celebrate: true, actionType: 'weight_logged' },
      fail: "Couldn't log the weight. Try again.",
      then: () => {
        setNewWeight({ value: '' });
        setWeightSheet(false);
      },
    });
  };

  const handleDeleteWeight = (w) => askConfirm({
    title: 'Delete entry?',
    message: `Remove the ${w.value.toFixed(1)} ${wUnit} entry?`,
    confirmLabel: 'Delete',
    destructive: true,
    action: () => save(`weight-del-${w.id}`, () => deleteWeight(petId, w.id), {
      ok: 'Entry deleted',
      fail: "Couldn't delete the entry. Try again.",
    }),
  });

  const handleAddExpense = () => {
    const amt = parseFloat(newExpense.amount);
    if (!amt || amt <= 0) return undefined;
    return save('expense', () => addExpense(petId, { category: newExpense.category, amount: amt, notes: newExpense.notes.trim() || null }), {
      ok: 'Expense added',
      fail: "Couldn't add the expense. Try again.",
      then: () => {
        setNewExpense({ category: 'vet', amount: '', notes: '' });
        setExpenseSheet(false);
      },
    });
  };

  const handleDeleteExpense = (e) => askConfirm({
    title: 'Delete expense?',
    message: `Remove this ${catMeta(e.category).label.toLowerCase()} expense?`,
    confirmLabel: 'Delete',
    destructive: true,
    action: () => save(`expense-del-${e.id}`, () => deleteExpense(petId, e.id), {
      ok: 'Expense deleted',
      fail: "Couldn't delete the expense. Try again.",
    }),
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
    action: () => save(`member-${member.id}`, () => removePetMember(petId, member.id), {
      ok: 'Co-owner removed',
      fail: `Couldn't remove ${member.name}. Try again.`,
      then: loadShare,
    }),
  });

  const handleCancelInvite = (invite) => setTeamConfirm({
    title: 'Cancel invitation?',
    message: `Withdraw the invite to ${invite.email}?`,
    confirmLabel: 'Withdraw',
    destructive: true,
    action: () => save(`invite-${invite.id}`, () => cancelPetInvite(petId, invite.id), {
      ok: 'Invite withdrawn',
      fail: "Couldn't withdraw the invite. Try again.",
      then: loadShare,
    }),
  });

  const leaveConfig = () => ({
    title: 'Leave pet?',
    message: `Stop co-owning ${pet.name}? You'll lose access to its records.`,
    confirmLabel: 'Leave',
    destructive: true,
    // Navigate away first so the pet vanishing from state can't flash a
    // "Pet not found" frame; the detach then completes in the background.
    action: () => { setTeamSheet(false); navigation.goBack(); leavePet(petId); },
  });
  const handleLeave = () => setTeamConfirm(leaveConfig());

  // Close the ••• menu before presenting the next modal — iOS drops a modal
  // presented while another is still dismissing (Sheet exits in ≤300ms).
  const fromMenu = (fn) => {
    setMenuSheet(false);
    setTimeout(fn, 320);
  };

  // ── Derived data ──

  const vaccinations = pet.vaccinations || [];
  const upcoming = vaccinations.filter((v) => v.status !== 'completed');
  const completedVax = vaccinations.filter((v) => v.status === 'completed');
  const { status, label: statusLabel } = petHealthStatus(vaccinations);
  // Vaccinations that didn't load (DataContext's pet.missing) have no status:
  // no "All good" pill, and the tile says so instead of "Add a first vaccine".
  const vaxUnknown = pet.missing?.includes('vaccinations');
  // The Health tile names the earliest open vaccine, neutrally — the status
  // itself is shown once, in the hero pill.
  const nextVax = [...upcoming]
    .filter((v) => v.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const healthTileValue = vaxUnknown
    ? "Couldn't load vaccines"
    : nextVax
    ? `${nextVax.name} · ${fmtShort(parseDay(nextVax.dueDate))}`
    : completedVax.length
      ? `${completedVax.length} ${completedVax.length === 1 ? 'vaccine' : 'vaccines'} on record`
      : 'Add a first vaccine';

  const latestWeight = normWeights[normWeights.length - 1];

  const expenses = pet.expenses || [];
  const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisMonthSpend = expenses
    .filter((e) => (e.incurredOn || '').startsWith(monthPrefix))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const foods = pet.favoriteFoods || [];
  const pair = petPair(pet.color);
  const photoUri = petPhoto(pet) || null;
  const heroFg = photoUri ? ui.onAccent : ui.ink;
  const speciesLabel = [pet.type ? cap(pet.type) : 'Pet', pet.breed || null].filter(Boolean).join(' · ');
  const heroMeta = [
    pet.age ? `${pet.age} yr${pet.age !== 1 ? 's' : ''}` : null,
    pet.gender ? cap(pet.gender) : null,
    pet.microchipped ? 'Microchipped' : null,
  ].filter(Boolean).join(' · ');

  // Today: active daily meds, done = a dose logged on today's local date.
  // Counted in doses, one per scheduled time: a twice-daily med is "1 of 2"
  // after breakfast, never done.
  const todayKey = dayKey(today);
  const dailyMeds = (pet.medications || []).filter((m) => m.active && m.frequency === 'daily');
  const takenToday = (m) => dosesTakenOn(m, { doseCounts: medDoseCounts, doseDays: medDoseDays }, todayKey);
  const dosesTotal = dailyMeds.reduce((sum, m) => sum + dosesPerDay(m), 0);
  const dailyDone = dailyMeds.reduce((sum, m) => sum + takenToday(m), 0);
  const activities = pet.activities || [];

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
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.lostBanner, pressed && { backgroundColor: ui.dangerPressTint }]} onPress={handleMarkFound}>
          <MaterialCommunityIcons name="map-marker-alert" size={20} color={ui.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lostTitle}>{pet.name} is reported lost</Text>
            <Text style={styles.lostSub}>Shared to the community board · tap to mark found</Text>
          </View>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={ui.success} />
        </Pressable>
      )}

      {/* Today — the most frequent task first; the one elevated card here. */}
      {dailyMeds.length > 0 ? (
        <Card padded elevated style={[styles.block, { padding: 18, gap: 12 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Today for {pet.name}</Text>
            <Text style={styles.todayCount}>{dailyDone} of {dosesTotal} done</Text>
          </View>
          <StepProgress done={dailyDone} total={dosesTotal} tone="success" />
          <View>
            {dailyMeds.map((med) => {
              const expected = dosesPerDay(med);
              const taken = takenToday(med);
              const done = taken >= expected;
              return (
                <View key={med.id} style={styles.todayRow}>
                  <MaterialCommunityIcons
                    name={done ? 'check-circle' : 'checkbox-blank-circle-outline'}
                    size={24}
                    color={done ? ui.success : ui.subtle}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.rowTitle, { color: done ? ui.sub : ui.ink }]} numberOfLines={1}>
                      {med.name}{med.dosage ? ` · ${med.dosage}` : ''}
                    </Text>
                    {med.times?.length ? (
                      <Text style={[type.secondary, { color: ui.sub }]}>
                        {med.times.map((t) => fmtTime(t) || t).join(', ')}
                        {expected > 1 && !done ? ` · ${taken} of ${expected} given` : ''}
                      </Text>
                    ) : null}
                  </View>
                  {done ? (
                    <Text style={[type.secondary, { color: ui.success, fontFamily: 'PlusJakartaSans_600SemiBold' }]}>Given</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${med.name} done`}
                      onPress={() => handleLogDose(med)}
                      disabled={isBusy(med.id)}
                      accessibilityState={{ disabled: isBusy(med.id) }}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.doneBtn,
                        (pressed || isBusy(med.id)) && { opacity: motion.pressOpacitySoft },
                      ]}
                    >
                      <Text style={styles.doneBtnText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      ) : (
        <Card padded elevated style={[styles.block, styles.todayEmpty]}>
          <View style={[styles.tileChip, { backgroundColor: pair.bg }]}>
            <MaterialCommunityIcons name="pill" size={20} color={pair.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.rowTitle, { color: ui.ink }]}>Nothing to give today</Text>
            <Text style={[type.secondary, { color: ui.sub }]}>Add a daily med and we'll nudge you on time.</Text>
          </View>
          <Button pill small label="Add" icon="plus" variant="soft" onPress={() => setMedSheet(true)} />
        </Card>
      )}

      {/* Four summaries, one number deep — the detail is one tap away. */}
      <View style={styles.tileGrid}>
        {[
          [
            {
              icon: 'needle', title: 'Health', value: healthTileValue,
              onPress: () => setSegment('health'),
            },
            {
              icon: 'run', title: 'Routine',
              value: activities.length ? `${activities.length} daily ${activities.length === 1 ? 'activity' : 'activities'}` : 'Not set up yet',
              onPress: () => setSegment('notes'),
            },
          ],
          [
            {
              icon: 'scale-bathroom', title: 'Weight',
              value: latestWeight ? `${latestWeight.value.toFixed(1)} ${wUnit}${trendText ? ` · ${trendText.toLowerCase()}` : ''}` : 'Log a first weight',
              onPress: () => setWeightSheet(true),
            },
            {
              icon: 'note-text-outline', title: 'Notes', value: 'Sitter notes & handoff',
              onPress: () => setSegment('notes'),
            },
          ],
        ].map((row, ri) => (
          <View key={ri} style={styles.tileRow}>
            {row.map((t) => (
              <Pressable
                key={t.title}
                accessibilityRole="button"
                accessibilityLabel={`${t.title}: ${t.value}`}
                onPress={t.onPress}
                style={({ pressed }) => [styles.tile, pressed && { backgroundColor: ui.pressTint }]}
              >
                <View style={[styles.tileChip, { backgroundColor: pair.bg }]}>
                  <MaterialCommunityIcons name={t.icon} size={20} color={pair.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.tileTitle}>{t.title}</Text>
                  <Text
                    numberOfLines={2}
                    style={styles.tileValue}
                  >
                    {t.value}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

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
                  <Pressable
                    onPress={() => handleDeleteWeight(w)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete weight from ${fullDate(w.loggedAt)}`}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={ui.subtle} />
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
              <IconChip icon={m.icon} pair={pair} />
              <View style={{ flex: 1 }}>
                <Text style={[type.rowTitle, { color: ui.ink }]}>
                  {m.label}{e.notes ? <Text style={[type.secondary, { color: ui.sub }]}>  ·  {e.notes}</Text> : null}
                </Text>
                <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>{fullDate(e.incurredOn)}</Text>
              </View>
              <Text style={styles.expenseAmount}>{Number(e.amount).toFixed(2)}</Text>
              <Pressable
                onPress={() => handleDeleteExpense(e)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${m.label} expense from ${fullDate(e.incurredOn)}`}
              >
                <MaterialCommunityIcons name="close" size={15} color={ui.subtle} />
              </Pressable>
            </View>
          );
        })}
        <AddRow label="Add expense" onPress={() => setExpenseSheet(true)} />
      </Card>
      {/* Report lost moved to the ••• menu — out of the browse path. */}
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
            <Animated.View key={v.id} exiting={ROW_OUT} layout={ROW_LAYOUT}>
              <ListRow
                title={v.name}
                subtitle={`Due ${fullDate(v.dueDate) || '—'}`}
                right={<StatusPill status={p.status} label={p.label} />}
                onPress={() => navigation.navigate('VaccinationTracker', { petId })}
              />
            </Animated.View>
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
          <Animated.View key={med.id} exiting={ROW_OUT} layout={ROW_LAYOUT}>
            <MedicationRow
              med={med}
              pair={pair}
              streakLabel={medicationStreakLabel(medicationStreak(medDoseDays?.[med.id], med))}
              onLog={() => handleLogDose(med)}
              onDelete={() => handleDeleteMedication(med)}
            />
          </Animated.View>
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
          <Card style={styles.block}>
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
          <ActivityRow key={act.id} activity={act} pair={pair} />
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

  const menuItems = [
    { icon: 'pencil-outline', title: 'Edit details', onPress: () => { setMenuSheet(false); navigation.navigate('EditPet', { petId }); } },
    { icon: 'share-variant-outline', title: 'Share with vet', onPress: () => fromMenu(() => setVetSheet(true)) },
    { icon: 'account-group-outline', title: 'Care team', onPress: () => fromMenu(() => { setInviteError(null); setTeamSheet(true); }) },
    activeReport
      ? { icon: 'home-heart', title: `Mark ${pet.name} as found`, onPress: () => fromMenu(handleMarkFound) }
      : { icon: 'map-marker-alert-outline', title: `Report ${pet.name} as lost`, danger: true, onPress: () => fromMenu(() => setLostSheet(true)) },
    !isOwner && { icon: 'exit-to-app', title: 'Leave this pet', danger: true, onPress: () => fromMenu(() => askConfirm(leaveConfig())) },
  ].filter(Boolean);

  return (
    <View style={styles.safe}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero — the pet's photo, or its identity tint + species glyph. */}
        <View style={[styles.hero, { height: HERO_HEIGHT + insets.top, backgroundColor: pair.bg }]}>
          {photoUri ? (
            <>
              <Image
                source={{ uri: photoUri }}
                style={styles.heroImg}
                accessibilityLabel={`Photo of ${pet.name}`}
              />
              {/* Light top scrim keeps the dark status bar legible. */}
              <LinearGradient
                colors={scrim.cream}
                style={[styles.scrimTop, { height: insets.top + 90 }]}
                pointerEvents="none"
              />
              <LinearGradient
                colors={scrim.bottom}
                style={styles.scrimBottom}
                pointerEvents="none"
              />
            </>
          ) : (
            <MaterialCommunityIcons
              name={speciesIcon(pet.type)}
              size={190}
              color={pair.fg}
              style={styles.heroGlyph}
            />
          )}

          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.heroBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => navigation.goBack()}
              hitSlop={4}
            >
              <MaterialCommunityIcons name="arrow-left" size={21} color={ui.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${pet.name}`}
              style={({ pressed }) => [styles.heroBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => setMenuSheet(true)}
              hitSlop={4}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={22} color={ui.ink} />
            </Pressable>
          </View>

          <View style={styles.heroText}>
            <View style={styles.heroPills}>
              <View style={[styles.speciesPill, { backgroundColor: photoUri ? pair.bg : ui.surface }]}>
                <MaterialCommunityIcons name={speciesIcon(pet.type)} size={14} color={pair.fg} />
                <Text style={[styles.speciesPillText, { color: pair.fg }]} numberOfLines={1}>{speciesLabel}</Text>
              </View>
              {/* Status shown exactly once on this screen. */}
              {!vaxUnknown && <StatusPill status={status} label={statusLabel} style={{ alignSelf: 'auto' }} />}
            </View>
            <Text style={[type.display, { color: heroFg }]} numberOfLines={1}>{pet.name}</Text>
            {heroMeta ? <Text style={[styles.heroMeta, { color: heroFg }]}>{heroMeta}</Text> : null}
          </View>
        </View>

        {/* Cream sheet sliding up over the hero. */}
        <View style={styles.sheet}>
          <SegmentedControl
            segments={SEGMENTS}
            value={segment}
            onChange={setSegment}
            style={styles.segmented}
          />

          {/* Fade only on segment switch — tabs are peers, no slide. */}
          <Animated.View key={segment} entering={SEGMENT_IN}>
            {segment === 'overview' && renderOverview()}
            {segment === 'health' && renderHealth()}
            {segment === 'notes' && renderNotes()}
          </Animated.View>
        </View>
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[styles.statusBackdrop, { height: insets.top }, statusBackdropStyle]}
      />

      {/* ••• menu — rarely-used and destructive actions, off the browse path. */}
      <Sheet visible={menuSheet} onClose={() => setMenuSheet(false)} title={pet.name}>
        <Card>
          {menuItems.map((m, i) => (
            <ListRow
              key={m.title}
              icon={m.icon}
              title={m.title}
              chevron
              danger={m.danger}
              onPress={m.onPress}
              last={i === menuItems.length - 1}
            />
          ))}
        </Card>
      </Sheet>

      {/* ── Sheets ── */}

      {/* Favorite foods */}
      <Sheet visible={foodSheet} onClose={() => { setFoodSheet(false); setNewFood(''); }} title="Favorite foods">
        {foods.length > 0 && (
          <View style={styles.foodWrap}>
            {foods.map((food) => (
              <View key={food.id} style={styles.foodChip}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={13} color={ui.accent} />
                <Text style={styles.foodChipText}>{food.name}</Text>
                <Pressable
                  onPress={() => handleRemoveFood(food)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${food.name}`}
                >
                  <MaterialCommunityIcons name="close" size={13} color={ui.subtle} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inlineAddRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="e.g. Salmon kibble"
            placeholderTextColor={ui.placeholder}
            value={newFood}
            onChangeText={setNewFood}
          />
          <Pressable
            style={styles.inlineAddBtn}
            onPress={handleAddFood}
            disabled={isBusy('food')}
            accessibilityRole="button"
            accessibilityLabel="Add food"
          >
            <MaterialCommunityIcons name="plus" size={20} color={ui.onAccent} />
          </Pressable>
        </View>
      </Sheet>

      {/* Add activity */}
      <Sheet visible={activitySheet} onClose={() => setActivitySheet(false)} title="Add activity">
        <TextInput
          style={styles.input}
          placeholder="Activity name (e.g. Park walk)"
          placeholderTextColor={ui.placeholder}
          value={newActivity.name}
          onChangeText={(v) => setNewActivity({ ...newActivity, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Duration in minutes"
          placeholderTextColor={ui.placeholder}
          value={newActivity.duration}
          onChangeText={(v) => setNewActivity({ ...newActivity, duration: v })}
          keyboardType="number-pad"
        />
        <View style={styles.chipWrap}>
          {['morning', 'afternoon', 'evening'].map((t) => (
            <Chip
              accessibilityRole="radio"
              key={t}
              label={cap(t)}
              active={newActivity.timeOfDay === t}
              onPress={() => setNewActivity({ ...newActivity, timeOfDay: t })}
            />
          ))}
        </View>
        <Button label="Add activity" onPress={handleAddActivity} disabled={!newActivity.name.trim() || isBusy('activity')} />
      </Sheet>

      {/* Add medication */}
      <Sheet visible={medSheet} onClose={() => setMedSheet(false)} title="Add medication">
        <TextInput
          style={styles.input}
          placeholder="Name (e.g. Apoquel)"
          placeholderTextColor={ui.placeholder}
          value={newMed.name}
          onChangeText={(v) => setNewMed({ ...newMed, name: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Dosage (e.g. 5mg, 1 tablet)"
          placeholderTextColor={ui.placeholder}
          value={newMed.dosage}
          onChangeText={(v) => setNewMed({ ...newMed, dosage: v })}
        />
        <View>
          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipWrap}>
            {['daily', 'weekly', 'monthly', 'as_needed'].map((f) => (
              <Chip
                accessibilityRole="radio"
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
        <Button label="Add medication" onPress={handleAddMedication} disabled={!newMed.name.trim() || isBusy('medication')} />
      </Sheet>

      {/* Report lost */}
      <Sheet visible={lostSheet} onClose={() => setLostSheet(false)} title={`Report ${pet.name} as lost`}>
        <Text style={styles.sheetHint}>This shares an alert to the community Lost Pets board.</Text>
        <TextInput
          style={styles.input}
          placeholder="Last seen location (e.g. Riverside Park)"
          placeholderTextColor={ui.placeholder}
          value={lostForm.lastSeenLocation}
          onChangeText={(v) => setLostForm({ ...lostForm, lastSeenLocation: v })}
        />
        <TextInput
          style={[styles.input, styles.inputArea]}
          placeholder="Details (color, collar, temperament…)"
          placeholderTextColor={ui.placeholder}
          value={lostForm.description}
          onChangeText={(v) => setLostForm({ ...lostForm, description: v })}
          multiline
        />
        <TextInput
          style={styles.input}
          placeholder="Contact phone"
          placeholderTextColor={ui.placeholder}
          value={lostForm.contactPhone}
          onChangeText={(v) => setLostForm({ ...lostForm, contactPhone: v })}
          keyboardType="phone-pad"
        />
        <Button variant="danger" label="Report lost" onPress={handleReportLost} disabled={isBusy('report-lost')} />
      </Sheet>

      {/* Log weight */}
      <Sheet visible={weightSheet} onClose={() => setWeightSheet(false)} title={`Log ${pet.name}'s weight`}>
        <View style={styles.inlineAddRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="e.g. 22.5"
            placeholderTextColor={ui.placeholder}
            value={newWeight.value}
            onChangeText={(v) => setNewWeight({ value: v })}
            keyboardType="decimal-pad"
          />
          <View style={styles.unitBox}>
            <Text style={styles.unitText}>{wUnit}</Text>
          </View>
        </View>
        <Text style={styles.sheetHint}>Logged in {wUnit} — change the unit in Edit Pet.</Text>
        <Button label="Log weight" onPress={handleAddWeight} disabled={!parseFloat(newWeight.value) || isBusy('weight')} />
      </Sheet>

      {/* Add expense */}
      <Sheet visible={expenseSheet} onClose={() => setExpenseSheet(false)} title={`Add expense for ${pet.name}`}>
        <View>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipWrap}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip
                accessibilityRole="radio"
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
          placeholderTextColor={ui.placeholder}
          value={newExpense.amount}
          onChangeText={(v) => setNewExpense({ ...newExpense, amount: v })}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor={ui.placeholder}
          value={newExpense.notes}
          onChangeText={(v) => setNewExpense({ ...newExpense, notes: v })}
        />
        <Button label="Add expense" onPress={handleAddExpense} disabled={!parseFloat(newExpense.amount) || isBusy('expense')} />
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
              <Pressable
                onPress={() => handleRemoveMember(m)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.name || m.email} from the care team`}
              >
                <MaterialCommunityIcons name="close" size={18} color={ui.subtle} />
              </Pressable>
            ) : (
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>Co-owner</Text></View>
            )}
          </View>
        ))}
        {isOwner && (share?.invites || []).map((inv) => (
          <View key={inv.id} style={styles.memberRow}>
            <View style={[styles.memberAvatar, { backgroundColor: ui.track }]}>
              <MaterialCommunityIcons name="email-outline" size={17} color={ui.sub} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.rowTitle, { color: ui.ink }]}>{inv.email}</Text>
              <Text style={[type.secondary, { color: ui.sub }]}>Invitation pending</Text>
            </View>
            <Pressable
              onPress={() => handleCancelInvite(inv)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Cancel the invite to ${inv.email}`}
            >
              <MaterialCommunityIcons name="close" size={18} color={ui.subtle} />
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
              placeholderTextColor={ui.placeholder}
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
            <Pressable accessibilityRole="button"
              style={({ pressed }) => [styles.dangerOutlineBtn, pressed && { backgroundColor: ui.dangerPressTint }]}
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
    </View>
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

function MedicationRow({ med, pair, streakLabel, onLog, onDelete }) {
  const freqLabel = med.frequency === 'as_needed'
    ? 'As needed'
    : `${cap(med.frequency)}${med.times?.length ? ` · ${med.times.join(', ')}` : ''}`;
  const lastGiven = med.lastAdministeredAt
    ? new Date(med.lastAdministeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.itemRow, !med.active && { opacity: 0.55 }]}>
      <IconChip icon="pill" pair={pair} />
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
      <Pressable
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${med.name}`}
      >
        <MaterialCommunityIcons name="close" size={16} color={ui.subtle} />
      </Pressable>
    </View>
  );
}

function ActivityRow({ activity, pair }) {
  const timeIcons = { morning: 'weather-sunny', afternoon: 'weather-partly-cloudy', evening: 'weather-night' };
  return (
    <View style={styles.itemRow}>
      <IconChip icon={timeIcons[activity.timeOfDay] || 'run'} pair={pair} />
      <View style={{ flex: 1 }}>
        <Text style={[type.rowTitle, { color: ui.ink }]}>{activity.name}</Text>
        <Text style={[type.secondary, { color: ui.sub, marginTop: 1, textTransform: 'capitalize' }]}>
          {activity.duration} min · {activity.timeOfDay}
        </Text>
      </View>
    </View>
  );
}

// Row icon on the pet's identity tint — the pet's color threads through its
// own records (decoration only; actions stay brown).
function IconChip({ icon, pair }) {
  return (
    <View style={[styles.rowChip, { backgroundColor: pair?.bg ?? ui.accentTint }]}>
      <MaterialCommunityIcons name={icon} size={17} color={pair?.fg ?? ui.accent} />
    </View>
  );
}

// Dashed "add" row at the bottom of a card.
function AddRow({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.addRow, pressed && { backgroundColor: ui.pressTint }]} onPress={onPress}>
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
                <Chip accessibilityRole="radio" key={e.id} label={e.label} active={expiresIn === e.id} onPress={() => setExpiresIn(e.id)} />
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

      <Pressable accessibilityRole="button" style={styles.revokeBtn} onPress={() => setConfirmRevoke(true)} disabled={busy}>
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
                  <Chip accessibilityRole="radio" key={e.id} label={e.label} active={expiresIn === e.id} onPress={() => setExpiresIn(e.id)} />
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
          <Pressable accessibilityRole="button" style={styles.revokeBtn} onPress={() => setConfirmRevoke(true)} disabled={busy}>
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
  // Explicit 100% box, not absoluteFill: react-native-web leaves an
  // absoluteFill <Image> at its natural size instead of covering.
  heroImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  safe: { flex: 1, backgroundColor: ui.background },
  statusBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  hero: { overflow: 'hidden' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 230 },
  heroGlyph: { position: 'absolute', right: -18, bottom: 96, opacity: 0.22 },
  heroBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ui.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { position: 'absolute', left: 24, right: 24, bottom: 52, gap: 6 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 },
  speciesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 999,
    maxWidth: 240,
  },
  speciesPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  heroMeta: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, lineHeight: 19, opacity: 0.92 },
  sheet: {
    marginTop: -28,
    paddingTop: 20,
    backgroundColor: ui.background,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
  },
  segmented: { marginHorizontal: 24, marginBottom: 20 },
  todayCount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.sub },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4 },
  todayEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  doneBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  tileGrid: { marginHorizontal: 24, marginBottom: 18, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
    padding: 12,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  tileChip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowChip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
  tileValue: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, lineHeight: 16, color: ui.sub, marginTop: 1 },

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
    borderColor: ui.inputBorder,
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
    borderColor: ui.controlBorder, // a label, not a field: no field outline
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
  roleBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: ui.sub }, // sub: AA on track
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
