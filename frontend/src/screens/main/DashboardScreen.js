import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useObserve } from '../../services/observe';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { usePetsQuery } from '../../hooks/usePets';
import { usePetRecords } from '../../hooks/usePetRecords';
import { useFeedCount } from '../../hooks/useFeed';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useGamificationSummary, useGamificationRecap, milestoneLabel } from '../../hooks/useGamification';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useToday } from '../../hooks/useToday';
import { useInFlight } from '../../hooks/useInFlight';
import { useTickAt } from '../../hooks/useTickAt';
import { getPref, setPref } from '../../services/prefs';

const CARD_OUT = FadeOut.duration(150);
import { track } from '../../services/analytics';
import { noteGoodMoment } from '../../services/storeReview';
import { dayKey } from '../../utils/streaks';
import { dosesPerDay, dosesTakenOn } from '../../utils/doses';
import { dayDiff, fmtClock, fmtShort, fmtTime, overdueLabel, parseDay, relativeDay } from '../../utils/dates';
import { useLocale, useTranslation } from '../../i18n';
import { petById, petMeta, petPhoto } from '../../utils/pets';
import { ui, type, motion, petPair, photos, PET_COLOR_PAIRS } from '../../theme';
import {
  Button, Card, CareStreakCard, EmptyState, PetCard, PetFace, RecapCard, Skeleton, StatusPill, StepProgress,
  UpNextCard, petHealthStatus, showToast,
} from '../../components';

// Home ("Lively & Light") answers one question, "is everyone OK, and what do
// I do next?", before any card is read: the headline is the status sentence.
// Then the one elevated hero (Up Next), today's daily care as goal-gradient
// progress, the pets as photo cards on their identity tints, and what's coming
// up with each pet's face. A home with no pets is an invitation (photo empty
// state), never a blank screen.

function getGreeting(t, name) {
  const h = new Date().getHours();
  if (h < 12) return t('home.greeting.morning', { name });
  if (h < 18) return t('home.greeting.afternoon', { name });
  return t('home.greeting.evening', { name });
}

const vaxDate = (v) => parseDay(v.dueDate);

// Status sentence for the headline: names the pets so it's recognised, not
// read; never alarming, never shaming. Same buckets as petHealthStatus
// (overdue, then due soon, then all good), so Home never calls a pet "all
// good" that another screen shows as due — nor one whose vaccines didn't load.
function statusSentence(t, pets, overdueCount, dueCount, unknownCount) {
  if (overdueCount > 0) return t('home.status.overdue', { count: overdueCount });
  if (dueCount > 0) return t('home.status.dueSoon', { count: dueCount });
  if (unknownCount > 0) return t('home.status.unknown');
  if (pets.length === 1) return t('home.status.oneOk', { name: pets[0].name });
  if (pets.length === 2) return t('home.status.twoOk', { first: pets[0].name, second: pets[1].name });
  return t('home.status.allOk', { total: pets.length });
}

const BENEFITS = [
  { icon: 'bell-ring-outline', pair: PET_COLOR_PAIRS[0], labelKey: 'home.benefits.reminders' },
  { icon: 'shield-check-outline', pair: PET_COLOR_PAIRS[1], labelKey: 'home.benefits.records' },
  { icon: 'account-group-outline', pair: PET_COLOR_PAIRS[2], labelKey: 'home.benefits.family' },
];
const TEASER_PAIR = PET_COLOR_PAIRS[3];
const MED_ROWS = 4;

export default function DashboardScreen({ navigation }) {
  // The app language: tabs stay mounted, so a language switch must re-render
  // (and re-run the memos below that build date strings).
  const locale = useLocale();
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    dataLoaded, reminders, medDoseDays, medDoseCounts,
    markVaccinationComplete, logMedicationDose,
  } = useData();
  const pets = usePetRecords();
  // The community teaser counts the feed's posts. Home stays mounted under
  // the tab bar: a stale (or failed) feed refetches when it is shown again.
  const { data: postCount, isStale: feedStale, refetch: refetchFeed } = useFeedCount();
  useRefetchOnFocus(refetchFeed, { isStale: feedStale });
  // The bell's dot. Pushes arrive while Home is under another tab: a stale
  // count refetches when Home is shown again.
  const { data: unreadCount = 0, isStale: unreadStale, refetch: refetchUnread } = useUnreadCount();
  useRefetchOnFocus(refetchUnread, { isStale: unreadStale });

  // TTI: the dashboard is the main entry screen — interactive once the initial
  // data fan-out has rendered. Safe to call repeatedly; first call wins.
  const { markInteractive } = useObserve();
  // The first load waits on every domain, including all 1 + 6N pet requests
  // (~17s for one pet on a slow link). The pets row only needs names and
  // photos, which the React Query pets list has long before that, so it
  // shows from there while the rest of Home still loads. Off once loaded.
  const { data: earlyPets } = usePetsQuery({ enabled: !dataLoaded });
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
          showToast(pet ? t('home.milestoneToast', { pet: pet.name, label }) : label, { celebrate: true, actionType: 'milestone_earned' });
          track('milestone_earned', { key: fresh.key });
          noteGoodMoment('milestone');
        }
      }
      setPref('seenMilestones', ids);
    })();
  }, [gamification, pets, t]);

  const firstName = user?.name?.split(' ')[0] || t('home.friend');
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

  const reminderTimes = useMemo(
    () => reminders.map((r) => new Date(r.next_fire_at || r.fire_at).getTime()).filter(Number.isFinite),
    [reminders],
  );
  const reminderTick = useTickAt(reminderTimes);

  const { upNext, weekItems, hiddenOverdue, hiddenDue } = useMemo(() => {
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

    // Calendar days, like Health's "This week" (today + the next 7), so an
    // item never depends on what time Home happened to mount.
    const inWeek = (d) => {
      const n = dayDiff(d, today);
      return n >= 0 && n <= 7;
    };
    // A reminder is a moment, not a day: one that fired at 8:00 is history by
    // 15:00 (vaccines stay day-based). `reminderTick` re-runs this when the
    // next reminder fires, so a Home left open drops it on time.
    const now = new Date();

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
          vaxId: v.id,
          dueSoon: v.status === 'due_soon',
        })),
      ...reminders
        .filter((r) => r.next_fire_at || r.fire_at)
        .map((r) => ({ r, date: new Date(r.next_fire_at || r.fire_at) }))
        .filter(({ r, date }) => (
          !Number.isNaN(date.getTime()) && (r.schedule_type === 'recurring' || date >= now) && inWeek(date)
        ))
        .map(({ r, date }) => {
          const pet = petById(pets, r.pet_id);
          const time = fmtClock(date);
          return {
            key: `rem-${r.id}`,
            date,
            title: r.title,
            sub: pet ? `${pet.name} · ${fmtShort(date)}, ${time}` : `${fmtShort(date)}, ${time}`,
            pet,
          };
        }),
    ].sort((a, b) => a.date - b.date);
    const weekItems = week.slice(0, 5);

    // Everything the headline counts but Home doesn't show (overdue never
    // sits in Coming up; due-soon spans 30 days, Coming up only 7) — named by
    // the "N more" link, never announced and then hidden.
    const shownVax = new Set(weekItems.map((i) => i.vaxId).filter(Boolean));
    const hidden = (status) =>
      pending.filter((v) => v.status === status && v.id !== next?.id && !shownVax.has(v.id)).length;

    return {
      upNext: next,
      weekItems,
      hiddenOverdue: hidden('overdue'),
      hiddenDue: hidden('due_soon'),
    };
  }, [pets, reminders, today, reminderTick, locale]);

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
              const taken = dosesTakenOn(m, { doseCounts: medDoseCounts, doseDays: medDoseDays }, todayKey);
              return { med: m, pet, times: [...(m.times || [])].sort(), expected, taken, done: taken >= expected };
            }),
        )
        .sort((a, b) => (a.done - b.done) || String(a.times[0]).localeCompare(String(b.times[0]))),
    [pets, medDoseDays, medDoseCounts, todayKey],
  );
  // Four rows keep the card scannable; the rest are one tap away — every med
  // the progress bar counts can be logged from here.
  const [showAllMeds, setShowAllMeds] = useState(false);
  const dosesTotal = todayMeds.reduce((n, m) => n + m.expected, 0);
  const dosesDone = todayMeds.reduce((n, m) => n + m.taken, 0);

  // Headline and subline read the same rule as every other screen
  // (petHealthStatus: overdue, then due soon, then all good).
  const countVax = (status) =>
    pets.reduce((n, p) => n + (p.vaccinations || []).filter((v) => v.status === status).length, 0);
  const overdueCount = countVax('overdue');
  const dueCount = countVax('due_soon');
  // A pet whose vaccinations didn't load (DataContext lists the field in
  // pet.missing) has no known status — never counted as all good.
  const unknownPets = pets.filter((p) => p.missing?.includes('vaccinations'));
  const okPets = pets.filter(
    (p) => !unknownPets.includes(p) && petHealthStatus(p.vaccinations).status === 'ok'
  ).length;

  const upNextItem = upNext
    ? {
        title: upNext.name,
        subtitle: t('home.upNext.subtitle', { pet: upNext.pet.name, date: fmtShort(vaxDate(upNext)) }),
        status: upNext.status === 'overdue' ? 'overdue' : 'due',
        statusLabel:
          upNext.status === 'overdue'
            ? overdueLabel(upNext.dueDate, today)
            : t('home.upNext.dueOn', { date: fmtShort(vaxDate(upNext)) }),
        // No-shame framing: an invitation to act, never "you missed".
        note:
          upNext.status === 'overdue'
            ? t('home.upNext.note', { pet: upNext.pet.name, vaccine: upNext.name })
            : null,
        avatarColor: upNext.pet.color || ui.accentTint,
        avatarTextColor: petPair(upNext.pet.color).fg,
        initial: upNext.pet.name[0],
        photo: petPhoto(upNext.pet),
      }
    : null;

  // One tap, one request: a dose or completion in flight disables its button,
  // and the celebration only follows what the server actually saved.
  const { run, isBusy } = useInFlight();
  const logDose = ({ pet, med }) =>
    run(`dose-${med.id}`, async () => {
      const saved = await logMedicationDose(pet.id, med.id);
      if (saved) {
        showToast(t('home.toast.doseLogged', { pet: pet.name, med: med.name }), { celebrate: true, actionType: 'dose_logged' });
      } else {
        showToast(t('home.toast.doseFailed', { pet: pet.name, med: med.name }));
      }
    });
  const markUpNextDone = () =>
    run(`vax-${upNext.id}`, async () => {
      const saved = await markVaccinationComplete(upNext.pet.id, upNext.id);
      if (saved) {
        showToast(t('home.toast.vaccineDone', { name: upNext.name }), { celebrate: true, actionType: 'vaccination_done' });
      } else {
        showToast(t('home.toast.vaccineFailed', { name: upNext.name }));
      }
    });
  // "2 more overdue · 1 due soon" — whatever the headline counted that isn't
  // on Home is one tap away in Health.
  const moreLabel = [
    hiddenOverdue > 0 && t('home.more.overdue', { count: hiddenOverdue }),
    hiddenDue > 0 && (hiddenOverdue > 0
      ? t('home.more.dueSoon', { count: hiddenDue })
      : t('home.more.moreDueSoon', { count: hiddenDue })),
  ].filter(Boolean).join(t('home.more.separator'));

  const goPet = (pet) =>
    navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: pet.id } });
  const addPet = () => navigation.navigate('Pets', { screen: 'AddPet' });
  const noPets = dataLoaded && pets.length === 0;

  // `interactive` is false mid-load: the cards show, but opening a pet (or
  // adding one) waits until DataContext has the whole record, so nothing
  // reads a half-loaded pet as "No medications yet".
  const renderPets = (list, interactive) => (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{t('home.pets.title')}</Text>
        <Pressable onPress={() => navigation.navigate('Pets')} hitSlop={8} accessibilityRole="link">
          <Text style={styles.sectionLink}>{t('home.pets.seeAll')}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.petsRow}
      >
        {list.map((pet) => (
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
            disabled={!interactive}
          />
        ))}
        {interactive && (
          <Pressable
            style={({ pressed }) => [styles.addCard, pressed && { backgroundColor: ui.pressTint }]}
            onPress={addPet}
            accessibilityRole="button"
            accessibilityLabel={t('home.pets.addA11y')}
          >
            <MaterialCommunityIcons name="plus" size={24} color={ui.accent} />
            <Text style={styles.addCardText}>{t('home.pets.add')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {noPets ? t('home.welcome', { name: firstName }) : getGreeting(t, firstName)}
            </Text>
            {(noPets || pets.length > 0) && (
              <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">
                {noPets ? t('home.meetYourPets') : statusSentence(t, pets, overdueCount, dueCount, unknownPets.length)}
              </Text>
            )}
            {unknownPets.length > 0 ? (
              <Text style={styles.subline}>
                {unknownPets.length === 1
                  ? t('home.vaccinesFailedOne', { name: unknownPets[0].name })
                  : t('home.vaccinesFailedSome')}
              </Text>
            ) : (
              okPets < pets.length && pets.length > 1 && (
                <Text style={styles.subline}>
                  {t('home.okPets', { count: okPets, total: pets.length })}
                </Text>
              )
            )}
          </View>
          <Pressable
            style={({ pressed }) => [styles.bell, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? t('home.notificationsUnreadA11y', { count: unreadCount }) : t('home.notificationsA11y')}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={ui.ink} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </Pressable>
        </View>

        {!dataLoaded ? (
          // Placeholders until the first load lands — never "All caught up" or
          // "Nothing scheduled" for data that simply hasn't arrived yet. The
          // pets row is the exception: names and photos are no verdict, so it
          // shows (read-only) as soon as the pets list has arrived. It moves
          // down once the hero and Today cards land above it.
          earlyPets?.length > 0 ? (
            <>
              <View
                style={[styles.loading, styles.loadingHero]}
                accessible
                accessibilityLabel={t('home.loadingSummaryA11y')}
              >
                <Skeleton width="100%" height={170} radius={20} />
              </View>
              {renderPets(earlyPets, false)}
            </>
          ) : (
            <View style={styles.loading} accessibilityLabel={t('home.loadingPetsA11y')}>
              <Skeleton width="100%" height={170} radius={20} />
              <Skeleton width={110} height={11} style={{ marginTop: 28 }} />
              <View style={styles.loadingRow}>
                <Skeleton width={158} height={150} radius={22} />
                <Skeleton width={158} height={150} radius={22} />
              </View>
            </View>
          )
        ) : noPets ? (
          <View style={styles.empty}>
            <EmptyState
              photo={photos.emptyKitten}
              title={t('home.empty.title')}
              body={t('home.empty.body')}
              actionLabel={t('home.empty.action')}
              actionIcon="plus"
              onAction={addPet}
            />
            <Text style={[styles.sectionLabel, { marginTop: 30 }]}>{t('home.empty.benefitsTitle')}</Text>
            {BENEFITS.map((b) => (
              <View key={b.labelKey} style={styles.benefit}>
                <View style={[styles.iconChip, { backgroundColor: b.pair.bg }]}>
                  <MaterialCommunityIcons name={b.icon} size={19} color={b.pair.fg} />
                </View>
                <Text style={styles.benefitText}>{t(b.labelKey)}</Text>
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
                        ? t('home.celebration.birthday', { name: celebration.pet.name })
                        : t('home.celebration.gotchaDay', { count: celebration.years, name: celebration.pet.name })}
                    </Text>
                    {celebration.kind === 'birthday' && (
                      <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>
                        {t('home.celebration.turns', { count: celebration.years, name: celebration.pet.name })}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={dismissCelebration} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('home.celebration.dismiss')}>
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
                busy={!!upNext && isBusy(`vax-${upNext.id}`)}
                onDone={markUpNextDone}
                onReschedule={() =>
                  navigation.navigate('Pets', {
                    screen: 'VaccinationTracker',
                    params: { petId: upNext.pet.id },
                  })
                }
              />
            )}
            {!!moreLabel && (
              <Pressable
                onPress={() => navigation.navigate('Health')}
                hitSlop={8}
                accessibilityRole="link"
                style={({ pressed }) => [styles.moreLink, pressed && { opacity: motion.pressOpacity }]}
              >
                <Text style={styles.sectionLink}>
                  {t('home.more.seeAllInHealth', { items: moreLabel })}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={ui.accent} />
              </Pressable>
            )}

            {todayMeds.length > 0 && (
              <Card padded elevated={!upNextItem} style={[styles.hero, { padding: 18, gap: 12 }]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionLabel}>{t('home.today.title')}</Text>
                  <Text style={styles.progressLabel}>
                    {dosesDone === dosesTotal ? t('home.today.allDone') : t('home.today.doneOf', { done: dosesDone, total: dosesTotal })}
                  </Text>
                </View>
                <StepProgress done={dosesDone} total={dosesTotal} tone="success" height={8} />
                {(showAllMeds ? todayMeds : todayMeds.slice(0, MED_ROWS)).map((row) => (
                  <View key={row.med.id} style={styles.medRow}>
                    <Pressable onPress={() => goPet(row.pet)} accessibilityRole="button" accessibilityLabel={row.pet.name}>
                      <PetFace pet={row.pet} size={36} />
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, row.done && { color: ui.sub }]} numberOfLines={1}>
                        {t('home.today.medTitle', { pet: row.pet.name, med: row.med.name })}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={2}>
                        {[
                          row.expected > 1 && !row.done
                            ? t('home.today.givenOf', { taken: row.taken, expected: row.expected })
                            : null,
                          row.times.map(fmtTime).filter(Boolean).join(', ') || t('home.today.anyTime'),
                          row.med.dosage,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {row.done ? (
                      <StatusPill status="ok" label={t('home.today.done')} style={styles.rowPill} />
                    ) : (
                      <Button
                        small
                        variant="soft"
                        label={t('home.today.log')}
                        icon="check"
                        disabled={isBusy(`dose-${row.med.id}`)}
                        onPress={() => logDose(row)}
                        style={styles.logBtn}
                      />
                    )}
                  </View>
                ))}
                {todayMeds.length > MED_ROWS && (
                  <Pressable
                    onPress={() => setShowAllMeds((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showAllMeds }}
                    style={({ pressed }) => [styles.showMore, pressed && { opacity: motion.pressOpacity }]}
                  >
                    <Text style={styles.sectionLink}>
                      {showAllMeds ? t('home.today.showLess') : t('home.today.showMore', { count: todayMeds.length - MED_ROWS })}
                    </Text>
                    <MaterialCommunityIcons name={showAllMeds ? 'chevron-up' : 'chevron-down'} size={18} color={ui.accent} />
                  </Pressable>
                )}
              </Card>
            )}

            {renderPets(pets, true)}

            <CareStreakCard streaks={careStreaks} style={styles.hero} />

            {recapWindow && <RecapCard rows={recapRows} style={styles.hero} />}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>{t('home.comingUp.title')}</Text>
              <Pressable onPress={() => navigation.navigate('Health')} hitSlop={8} accessibilityRole="link">
                <Text style={styles.sectionLink}>{t('home.comingUp.healthLink')}</Text>
              </Pressable>
            </View>
            <Card style={styles.weekCard}>
              {weekItems.length === 0 ? (
                <View style={styles.weekEmpty}>
                  <MaterialCommunityIcons name="weather-sunny" size={18} color={ui.accent} />
                  <Text style={styles.emptyText}>{t('home.comingUp.empty')}</Text>
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
                  {postCount > 0 ? (
                    <>
                      <Text style={styles.teaserBold}>
                        {t('home.community.recentPosts', { count: postCount })}
                      </Text>
                      {t('home.community.inCommunity')}
                    </>
                  ) : (
                    // Until the feed loads, the count is unknown: not "say hi"
                    // to a community that may be busy.
                    t(postCount === 0 ? 'home.community.sayHi' : 'home.community.visit')
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
  showMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 4 },
  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginHorizontal: 24,
    marginTop: -12,
    marginBottom: 14,
  },
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
  loading: { paddingHorizontal: 16 },
  loadingHero: { marginBottom: 22 },
  loadingRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
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
