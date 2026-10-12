import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useObserve } from '../../services/observe';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useGamificationSummary, useGamificationRecap, milestoneLabel } from '../../hooks/useGamification';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useToday } from '../../hooks/useToday';
import { getPref, setPref } from '../../services/prefs';

const CARD_OUT = FadeOut.duration(150);
import { track } from '../../services/analytics';
import { noteGoodMoment } from '../../services/storeReview';
import { dayKey } from '../../utils/streaks';
import { dosesOn, dosesPerDay } from '../../utils/doses';
import { fmtShort, fmtTime, relativeDay } from '../../utils/dates';
import { petMeta, petPhoto } from '../../utils/pets';
import { ui, type, motion, petPair, photos, PET_COLOR_PAIRS } from '../../theme';
import {
  Button, Card, CareStreakCard, EmptyState, PetCard, PetFace, RecapCard, StatusPill, StepProgress,
  UpNextCard, petHealthStatus, showToast,
} from '../../components';

// Home ("Lively & Light") answers one question, "is everyone OK, and what do
// I do next?", before any card is read: the headline is the status sentence.
// Then the one elevated hero (Up Next), today's daily care as goal-gradient
// progress, the pets as photo cards on their identity tints, and what's coming
// up with each pet's face. A home with no pets is an invitation (photo empty
// state), never a blank screen.

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const vaxDate = (v) => new Date(`${v.dueDate}T12:00:00`);

// Status sentence for the headline: names the pets so it's recognised, not
// read; never alarming, never shaming. Same buckets as petHealthStatus
// (overdue, then due soon, then all good), so Home never calls a pet "all
// good" that another screen shows as due.
function statusSentence(pets, overdueCount, dueCount) {
  if (overdueCount === 1) return 'One thing needs\nyou today';
  if (overdueCount > 1) return `${overdueCount} things need\nyou today`;
  if (dueCount === 1) return 'One thing is\ndue soon';
  if (dueCount > 1) return `${dueCount} things are\ndue soon`;
  if (pets.length === 1) return `${pets[0].name} is\nall good`;
  if (pets.length === 2) return `${pets[0].name} and ${pets[1].name}\nare all good`;
  return `All ${pets.length} pets\nare all good`;
}

const BENEFITS = [
  { icon: 'bell-ring-outline', pair: PET_COLOR_PAIRS[0], label: 'Reminders before anything is due' },
  { icon: 'shield-check-outline', pair: PET_COLOR_PAIRS[1], label: 'Every record in one safe place' },
  { icon: 'account-group-outline', pair: PET_COLOR_PAIRS[2], label: 'Share care with your family' },
];
const TEASER_PAIR = PET_COLOR_PAIRS[3];

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const {
    dataLoaded, pets, posts, reminders, unreadCount, medDoseDays, medDoseCounts,
    markVaccinationComplete, logMedicationDose,
  } = useData();

  // TTI: the dashboard is the main entry screen — interactive once the initial
  // data fan-out has rendered. Safe to call repeatedly; first call wins.
  const { markInteractive } = useObserve();
  useEffect(() => {
    if (dataLoaded) markInteractive();
  }, [dataLoaded, markInteractive]);

  // Weekly care streaks + milestones (nightly-computed server-side).
  const { data: gamification, refetch: refetchGamification, isStale: gamificationStale } = useGamificationSummary();
  useRefetchOnFocus(refetchGamification, { isStale: gamificationStale });

  // Join streaks with pet names; pets the store hasn't loaded yet drop out.
  const careStreaks = useMemo(
    () =>
      (gamification?.streaks || [])
        .map((s) => {
          const pet = pets.find((p) => p.id === s.pet_id);
          return pet && {
            petId: s.pet_id,
            petName: pet.name,
            currentWeeks: s.current_weeks,
            longestWeeks: s.longest_weeks,
          };
        })
        .filter(Boolean),
    [gamification, pets],
  );

  // Streak visibility, bucketed — no counts, no names (analytics contract).
  useEffect(() => {
    const best = Math.max(0, ...careStreaks.map((s) => s.currentWeeks));
    if (best > 0) {
      const bucket = best <= 3 ? '1-3' : best <= 7 ? '4-7' : best <= 30 ? '8-30' : '30+';
      track('care_streak_viewed', { weeks_bucket: bucket });
    }
    // Once per streak-set change, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careStreaks.length]);

  // Celebrate milestones earned since this device last saw the summary. The
  // very first sighting only records the baseline — never a wall of toasts
  // for a pet's whole history.
  useEffect(() => {
    const milestones = gamification?.milestones;
    if (!milestones?.length) return;
    (async () => {
      const seen = await getPref('seenMilestones', null);
      const ids = milestones.map((m) => m.id);
      if (seen !== null) {
        const fresh = milestones.find((m) => !seen.includes(m.id) && milestoneLabel(m.key));
        if (fresh) {
          const pet = pets.find((p) => p.id === fresh.pet_id);
          const label = milestoneLabel(fresh.key);
          showToast(pet ? `${pet.name}: ${label}` : label, { celebrate: true, actionType: 'milestone_earned' });
          track('milestone_earned', { key: fresh.key });
          noteGoodMoment('milestone');
        }
      }
      setPref('seenMilestones', ids);
    })();
  }, [gamification, pets]);

  const firstName = user?.name?.split(' ')[0] || 'Friend';
  // Rolls over at midnight / on refocus — Home stays mounted, and "done
  // today" must never key on yesterday.
  const today = useToday();

  // Weekly recap — fetched only around the week boundary (Sun–Mon), matching
  // the Sunday-evening recap push so the card and notification agree.
  const recapWindow = today.getDay() === 0 || today.getDay() === 1;
  const { data: recap } = useGamificationRecap(recapWindow);
  const recapRows = useMemo(
    () =>
      (recap?.per_pet || [])
        .map((p) => {
          const pet = pets.find((x) => x.id === p.pet_id);
          return pet && {
            petId: p.pet_id,
            petName: pet.name,
            doses: p.doses,
            weights: p.weights,
            activities: p.activities,
            vaxCurrent: p.vax_current,
          };
        })
        .filter(Boolean),
    [recap, pets],
  );

  useEffect(() => {
    const actions = recapRows.reduce((n, r) => n + r.doses + r.weights + r.activities, 0);
    if (actions > 0) {
      const bucket = actions <= 3 ? '1-3' : actions <= 10 ? '4-10' : '10+';
      track('recap_viewed', { actions_bucket: bucket });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapRows.length]);

  // Birthday / gotcha-day banner — client-computed from pet dates, so it works
  // even with engagement pushes off. Dismissable per pet+kind+year via prefs.
  const [dismissedCelebrations, setDismissedCelebrations] = useState([]);
  useEffect(() => {
    getPref('celebrationsDismissed', []).then(setDismissedCelebrations);
  }, []);

  const celebration = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const todayMd = `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    for (const pet of pets) {
      for (const [kind, iso] of [['birthday', pet.birthday], ['gotcha_day', pet.adoptedOn]]) {
        if (!iso || iso.slice(5) !== todayMd) continue;
        const years = today.getFullYear() - Number(iso.slice(0, 4));
        if (years <= 0) continue; // no anniversary in the origin year
        const dismissKey = `${pet.id}:${kind}:${today.getFullYear()}`;
        if (dismissedCelebrations.includes(dismissKey)) continue;
        return { pet, kind, years, dismissKey };
      }
    }
    return null;
  }, [pets, today, dismissedCelebrations]);

  const dismissCelebration = () => {
    const next = [...dismissedCelebrations, celebration.dismissKey].slice(-40);
    setDismissedCelebrations(next);
    setPref('celebrationsDismissed', next);
  };

  const { upNext, weekItems } = useMemo(() => {
    const pending = pets.flatMap((pet) =>
      (pet.vaccinations || [])
        .filter((v) => v.status === 'overdue' || v.status === 'due_soon' || v.status === 'upcoming')
        // A record whose date can't parse must not become the Up Next card
        // (the week list below already filters the same way).
        .filter((v) => !Number.isNaN(vaxDate(v).getTime()))
        .map((v) => ({ ...v, pet }))
    );

    // Most urgent: any overdue (earliest first), else the nearest due-soon.
    // A merely upcoming record is not a task yet — it stays in Coming up.
    const earliest = (status) =>
      pending
        .filter((v) => v.status === status)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const next = earliest('overdue') || earliest('due_soon') || null;

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const inWeek = (d) => d >= new Date(today.toDateString()) && d <= weekEnd;

    const week = [
      ...pending
        // The Up Next item is already on screen with its status — once only.
        .filter((v) => v.status !== 'overdue' && v.id !== next?.id && inWeek(vaxDate(v)))
        .map((v) => ({
          key: `vax-${v.pet.id}-${v.id}`,
          date: vaxDate(v),
          title: v.name,
          sub: `${v.pet.name} · ${fmtShort(vaxDate(v))}`,
          pet: v.pet,
          dueSoon: v.status === 'due_soon',
        })),
      ...reminders
        .filter((r) => r.next_fire_at || r.fire_at)
        .map((r) => ({ r, date: new Date(r.next_fire_at || r.fire_at) }))
        .filter(({ date }) => !Number.isNaN(date.getTime()) && inWeek(date))
        .map(({ r, date }) => {
          const pet = pets.find((p) => p.id === r.pet_id);
          const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return {
            key: `rem-${r.id}`,
            date,
            title: r.title,
            sub: pet ? `${pet.name} · ${fmtShort(date)}, ${time}` : `${fmtShort(date)}, ${time}`,
            pet,
          };
        }),
    ].sort((a, b) => a.date - b.date);

    return {
      upNext: next,
      weekItems: week.slice(0, 5),
    };
  }, [pets, reminders, today]);

  // Today's daily care across the household: active daily meds, counted in
  // doses (one per scheduled time), so a twice-daily med is half done after
  // breakfast. Same local-day key as the streaks. Real data only: no progress
  // bar when there's nothing daily to track.
  const todayKey = dayKey(today);
  const todayMeds = useMemo(
    () =>
      pets
        .flatMap((pet) =>
          (pet.medications || [])
            .filter((m) => m.active && m.frequency === 'daily')
            .map((m) => {
              const expected = dosesPerDay(m);
              const taken = Math.min(
                expected,
                dosesOn(m, { doseCounts: medDoseCounts, doseDays: medDoseDays }, todayKey),
              );
              return { med: m, pet, times: [...(m.times || [])].sort(), expected, taken, done: taken >= expected };
            }),
        )
        .sort((a, b) => (a.done - b.done) || String(a.times[0]).localeCompare(String(b.times[0]))),
    [pets, medDoseDays, medDoseCounts, todayKey],
  );
  const dosesTotal = todayMeds.reduce((n, t) => n + t.expected, 0);
  const dosesDone = todayMeds.reduce((n, t) => n + t.taken, 0);

  // Headline and subline read the same rule as every other screen
  // (petHealthStatus: overdue, then due soon, then all good).
  const countVax = (status) =>
    pets.reduce((n, p) => n + (p.vaccinations || []).filter((v) => v.status === status).length, 0);
  const overdueCount = countVax('overdue');
  const dueCount = countVax('due_soon');
  const okPets = pets.filter((p) => petHealthStatus(p.vaccinations).status === 'ok').length;

  const upNextItem = upNext
    ? {
        title: upNext.name,
        subtitle: `${upNext.pet.name} · due ${fmtShort(vaxDate(upNext))}`,
        status: upNext.status === 'overdue' ? 'overdue' : 'due',
        statusLabel:
          upNext.status === 'overdue'
            ? (() => {
                const days = Math.max(1, Math.floor((Date.now() - vaxDate(upNext)) / 86400000));
                return `Overdue · ${days} day${days === 1 ? '' : 's'}`;
              })()
            : `Due ${fmtShort(vaxDate(upNext))}`,
        // No-shame framing: an invitation to act, never "you missed".
        note:
          upNext.status === 'overdue'
            ? `Let's get ${upNext.pet.name}'s ${upNext.name} booked.`
            : null,
        avatarColor: upNext.pet.color || ui.accentTint,
        avatarTextColor: petPair(upNext.pet.color).fg,
        initial: upNext.pet.name[0],
        photo: petPhoto(upNext.pet),
      }
    : null;

  // One tap, one dose: a dose in flight disables its Log button, and the
  // celebration only follows a dose the server actually saved.
  const inFlight = useRef(new Set());
  const [logging, setLogging] = useState([]);
  const logDose = async ({ pet, med }) => {
    if (inFlight.current.has(med.id)) return;
    inFlight.current.add(med.id);
    setLogging((ids) => [...ids, med.id]);
    const saved = await logMedicationDose(pet.id, med.id);
    inFlight.current.delete(med.id);
    setLogging((ids) => ids.filter((id) => id !== med.id));
    if (saved) {
      showToast(`${pet.name}'s ${med.name} logged`, { celebrate: true, actionType: 'dose_logged' });
    } else {
      showToast(`Couldn't log ${pet.name}'s ${med.name}. Try again.`);
    }
  };

  const goPet = (pet) =>
    navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: pet.id } });
  const addPet = () => navigation.navigate('Pets', { screen: 'AddPet' });
  const noPets = dataLoaded && pets.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {noPets ? `Welcome to PawPawCare, ${firstName}` : `${getGreeting()}, ${firstName}`}
            </Text>
            {(noPets || pets.length > 0) && (
              <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">
                {noPets ? "Let's meet your pets" : statusSentence(pets, overdueCount, dueCount)}
              </Text>
            )}
            {okPets < pets.length && pets.length > 1 && (
              <Text style={styles.subline}>
                {okPets} of your {pets.length} pets {okPets === 1 ? 'is' : 'are'} all good.
              </Text>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [styles.bell, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={ui.ink} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </Pressable>
        </View>

        {noPets ? (
          <View style={styles.empty}>
            <EmptyState
              photo={photos.emptyKitten}
              title="Add your first pet"
              body="A cat, a dog or any companion. It takes less than a minute."
              actionLabel="Add your first pet"
              actionIcon="plus"
              onAction={addPet}
            />
            <Text style={[styles.sectionLabel, { marginTop: 30 }]}>What you'll get</Text>
            {BENEFITS.map((b) => (
              <View key={b.label} style={styles.benefit}>
                <View style={[styles.iconChip, { backgroundColor: b.pair.bg }]}>
                  <MaterialCommunityIcons name={b.icon} size={19} color={b.pair.fg} />
                </View>
                <Text style={styles.benefitText}>{b.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            {celebration && (
              <Animated.View exiting={CARD_OUT}>
                <Card padded style={[styles.hero, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ui.accentTint, borderColor: ui.accentTint }]}>
                  <MaterialCommunityIcons
                    name={celebration.kind === 'birthday' ? 'cake-variant-outline' : 'heart-outline'}
                    size={22}
                    color={ui.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.cardTitleSm, { color: ui.ink }]}>
                      {celebration.kind === 'birthday'
                        ? `Happy birthday, ${celebration.pet.name}!`
                        : `Gotcha day — ${celebration.years} year${celebration.years === 1 ? '' : 's'} with ${celebration.pet.name}`}
                    </Text>
                    {celebration.kind === 'birthday' && (
                      <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>
                        {celebration.pet.name} turns {celebration.years} today
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={dismissCelebration} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
                    <MaterialCommunityIcons name="close" size={16} color={ui.subtle} />
                  </Pressable>
                </Card>
              </Animated.View>
            )}

            {/* The caught-up card only when there's no daily care to show either. */}
            {(upNextItem || todayMeds.length === 0) && (
              <UpNextCard
                item={upNextItem}
                style={styles.hero}
                onDone={async () => {
                  const saved = await markVaccinationComplete(upNext.pet.id, upNext.id);
                  if (saved) {
                    showToast(`${upNext.name} marked done`, { celebrate: true, actionType: 'vaccination_done' });
                  } else {
                    showToast(`Couldn't mark ${upNext.name} done. Try again.`);
                  }
                }}
                onReschedule={() =>
                  navigation.navigate('Pets', {
                    screen: 'VaccinationTracker',
                    params: { petId: upNext.pet.id },
                  })
                }
              />
            )}

            {todayMeds.length > 0 && (
              <Card padded elevated={!upNextItem} style={[styles.hero, { padding: 18, gap: 12 }]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionLabel}>Today</Text>
                  <Text style={styles.progressLabel}>
                    {dosesDone === dosesTotal ? 'All done' : `${dosesDone} of ${dosesTotal} done`}
                  </Text>
                </View>
                <StepProgress done={dosesDone} total={dosesTotal} tone="success" height={8} />
                {todayMeds.slice(0, 4).map((t) => (
                  <View key={t.med.id} style={styles.medRow}>
                    <Pressable onPress={() => goPet(t.pet)} accessibilityRole="button" accessibilityLabel={t.pet.name}>
                      <PetFace pet={t.pet} size={36} />
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, t.done && { color: ui.sub }]} numberOfLines={1}>
                        {t.pet.name}'s {t.med.name}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[
                          t.times.map(fmtTime).filter(Boolean).join(', ') || 'Today',
                          t.med.dosage,
                          t.expected > 1 && !t.done ? `${t.taken} of ${t.expected} given` : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {t.done ? (
                      <StatusPill status="ok" label="Done" style={styles.rowPill} />
                    ) : (
                      <Button
                        small
                        variant="soft"
                        label="Log"
                        icon="check"
                        disabled={logging.includes(t.med.id)}
                        onPress={() => logDose(t)}
                        style={styles.logBtn}
                      />
                    )}
                  </View>
                ))}
              </Card>
            )}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Your pets</Text>
              <Pressable onPress={() => navigation.navigate('Pets')} hitSlop={8} accessibilityRole="link">
                <Text style={styles.sectionLink}>See all</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.petsRow}
            >
              {pets.map((pet) => (
                <PetCard
                  key={pet.id}
                  width={158}
                  photoHeight={96}
                  name={pet.name}
                  meta={petMeta(pet)}
                  color={pet.color}
                  photo={petPhoto(pet)}
                  species={pet.type}
                  onPress={() => goPet(pet)}
                />
              ))}
              <Pressable
                style={({ pressed }) => [styles.addCard, pressed && { backgroundColor: ui.pressTint }]}
                onPress={addPet}
                accessibilityRole="button"
                accessibilityLabel="Add a pet"
              >
                <MaterialCommunityIcons name="plus" size={24} color={ui.accent} />
                <Text style={styles.addCardText}>Add</Text>
              </Pressable>
            </ScrollView>

            <CareStreakCard streaks={careStreaks} style={styles.hero} />

            {recapWindow && <RecapCard rows={recapRows} style={styles.hero} />}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Coming up</Text>
              <Pressable onPress={() => navigation.navigate('Health')} hitSlop={8} accessibilityRole="link">
                <Text style={styles.sectionLink}>Health</Text>
              </Pressable>
            </View>
            <Card style={styles.weekCard}>
              {weekItems.length === 0 ? (
                <View style={styles.weekEmpty}>
                  <MaterialCommunityIcons name="weather-sunny" size={18} color={ui.accent} />
                  <Text style={styles.emptyText}>Nothing scheduled this week. Enjoy the calm.</Text>
                </View>
              ) : (
                weekItems.map((item, i) => (
                  <View
                    key={item.key}
                    style={[styles.weekRow, i < weekItems.length - 1 && styles.rowDivider]}
                  >
                    {item.pet ? (
                      <PetFace pet={item.pet} size={36} />
                    ) : (
                      <View style={[styles.iconChip, { backgroundColor: ui.accentTint }]}>
                        <MaterialCommunityIcons name="bell-outline" size={18} color={ui.accent} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{item.sub}</Text>
                    </View>
                    {item.dueSoon ? (
                      <StatusPill status="due" style={styles.rowPill} />
                    ) : (
                      <Text style={styles.relDay}>{relativeDay(item.date, today)}</Text>
                    )}
                  </View>
                ))
              )}
            </Card>

            <Pressable
              onPress={() => navigation.navigate('Community')}
              style={({ pressed }) => pressed && { opacity: motion.pressOpacitySoft }}
              accessibilityRole="button"
            >
              <Card style={styles.teaser}>
                <View style={[styles.iconChip, { backgroundColor: TEASER_PAIR.bg }]}>
                  <MaterialCommunityIcons name="forum-outline" size={18} color={TEASER_PAIR.fg} />
                </View>
                <Text style={styles.teaserText}>
                  {posts.length > 0 ? (
                    <>
                      <Text style={styles.teaserBold}>
                        {posts.length} recent {posts.length === 1 ? 'post' : 'posts'}
                      </Text>
                      {' in the community'}
                    </>
                  ) : (
                    'Say hi to the community'
                  )}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={ui.faint} />
              </Card>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 20,
  },
  greeting: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: ui.sub, marginBottom: 4 },
  subline: { ...type.body, color: ui.sub, marginTop: 6 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ui.accent,
    borderWidth: 2,
    borderColor: ui.surface,
  },
  hero: { marginHorizontal: 16, marginBottom: 22 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: ui.sub,
    fontVariant: ['tabular-nums'],
  },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  logBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  rowPill: { alignSelf: 'center' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 24,
    marginBottom: 12,
  },
  sectionLabel: { ...type.sectionLabel, color: ui.subtle },
  sectionLink: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  petsRow: { gap: 12, paddingHorizontal: 16, paddingBottom: 24 },
  addCard: {
    width: 76,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ui.faint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addCardText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  weekCard: { marginHorizontal: 16, marginBottom: 22 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { ...type.rowTitle, fontSize: 15, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub },
  relDay: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: ui.sub },
  weekEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18 },
  emptyText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13.5,
    color: ui.sub,
  },
  empty: { paddingHorizontal: 24, paddingTop: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  benefitText: { ...type.rowTitle, fontSize: 15, color: ui.ink, flex: 1 },
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  teaserText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13.5,
    color: ui.ink,
  },
  teaserBold: { fontFamily: 'PlusJakartaSans_700Bold' },
});
