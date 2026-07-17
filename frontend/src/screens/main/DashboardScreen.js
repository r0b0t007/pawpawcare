import React, { useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useObserve } from '../../services/observe';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { resolveAsset } from '../../config';
import { ui, type } from '../../theme';
import { Card, StatusRing, UpNextCard, showToast } from '../../components';

// Home = one calm answer to "what needs my attention?": the UpNext hero,
// the pets row (status lives on the avatar ring, nowhere else), this week's
// schedule, and a community teaser. Stat cards, spend banner and the quick
// actions grid are gone per the redesign's delete list.

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// '—' rather than the string "Invalid Date" if a malformed date ever slips
// through (e.g. a stale bundle's locale-string dueDate) — never show garbage.
const fmtShort = (date) =>
  Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const vaxDate = (v) => new Date(`${v.dueDate}T12:00:00`);

// Worst vaccination status wins the avatar ring.
function petStatusOf(pet) {
  const statuses = (pet.vaccinations || []).map((v) => v.status);
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('due_soon')) return 'due';
  return 'ok';
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { dataLoaded, pets, posts, reminders, unreadCount, markVaccinationComplete } = useData();

  // TTI: the dashboard is the main entry screen — interactive once the initial
  // data fan-out has rendered. Safe to call repeatedly; first call wins.
  const { markInteractive } = useObserve();
  useEffect(() => {
    if (dataLoaded) markInteractive();
  }, [dataLoaded, markInteractive]);

  const firstName = user?.name?.split(' ')[0] || 'Friend';
  const today = useMemo(() => new Date(), []);
  const dateLabel = today
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();

  const { upNext, weekItems } = useMemo(() => {
    const pending = pets.flatMap((pet) =>
      (pet.vaccinations || [])
        .filter((v) => v.status === 'overdue' || v.status === 'due_soon' || v.status === 'upcoming')
        // A record whose date can't parse must not become the Up Next card
        // (the week list below already filters the same way).
        .filter((v) => !Number.isNaN(vaxDate(v).getTime()))
        .map((v) => ({ ...v, pet }))
    );

    // Most urgent: any overdue (earliest first), else the nearest due date.
    const next =
      pending
        .filter((v) => v.status === 'overdue')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ||
      pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ||
      null;

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const inWeek = (d) => d >= new Date(today.toDateString()) && d <= weekEnd;

    const week = [
      ...pending
        .filter((v) => v.status !== 'overdue' && inWeek(vaxDate(v)))
        .map((v) => ({
          key: `vax-${v.pet.id}-${v.id}`,
          date: vaxDate(v),
          title: v.name,
          sub: v.pet.name,
          dot: v.status === 'due_soon' ? ui.warn : ui.ringOk,
        })),
      ...reminders
        .filter((r) => r.next_fire_at || r.fire_at)
        .map((r) => ({ r, date: new Date(r.next_fire_at || r.fire_at) }))
        .filter(({ date }) => !Number.isNaN(date.getTime()) && inWeek(date))
        .map(({ r, date }) => ({
          key: `rem-${r.id}`,
          date,
          title: r.title,
          sub: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          dot: ui.ringOk,
        })),
    ].sort((a, b) => a.date - b.date);

    return { upNext: next, weekItems: week.slice(0, 5) };
  }, [pets, reminders, today]);

  const upNextItem = upNext
    ? {
        title: upNext.name,
        subtitle: `${upNext.pet.name} · due ${fmtShort(vaxDate(upNext))}`,
        status: upNext.status === 'overdue' ? 'overdue' : 'due',
        statusLabel:
          upNext.status === 'overdue'
            ? `Overdue · ${Math.max(1, Math.floor((Date.now() - vaxDate(upNext)) / 86400000))} days`
            : `Due ${fmtShort(vaxDate(upNext))}`,
        avatarColor: upNext.pet.color || ui.accentTint,
        avatarTextColor: ui.accent,
        initial: upNext.pet.name[0],
        photo: upNext.pet.avatarUrl ? resolveAsset(upNext.pet.avatarUrl) : undefined,
      }
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={[type.sectionLabel, { color: ui.subtle, marginBottom: 6 }]}>
              {dateLabel}
            </Text>
            <Text style={[type.screenTitle, { color: ui.ink }]}>
              {getGreeting()},{'\n'}{firstName}
            </Text>
          </View>
          <Pressable style={styles.bell} onPress={() => navigation.navigate('Notifications')}>
            <MaterialCommunityIcons name="bell-outline" size={24} color={ui.ink} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </Pressable>
        </View>

        <UpNextCard
          item={upNextItem}
          style={styles.hero}
          onDone={async () => {
            await markVaccinationComplete(upNext.pet.id, upNext.id);
            showToast(`${upNext.name} marked done`);
          }}
          onReschedule={() =>
            navigation.navigate('Pets', {
              screen: 'VaccinationTracker',
              params: { petId: upNext.pet.id },
            })
          }
        />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Your pets</Text>
          <Pressable onPress={() => navigation.navigate('Pets')}>
            <Text style={styles.sectionLink}>All pets</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.petsRow}
        >
          {pets.map((pet) => (
            <Pressable
              key={pet.id}
              style={styles.petItem}
              onPress={() =>
                navigation.navigate('Pets', { screen: 'PetProfile', params: { petId: pet.id } })
              }
            >
              <StatusRing
                size={62}
                color={pet.color || ui.accentTint}
                textColor={ui.accent}
                initial={pet.name[0]}
                photo={pet.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined}
                status={petStatusOf(pet)}
              />
              <Text style={styles.petName}>{pet.name}</Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.petItem}
            onPress={() => navigation.navigate('Pets', { screen: 'AddPet' })}
          >
            <View style={styles.addCircle}>
              <MaterialCommunityIcons name="plus" size={22} color={ui.accent} />
            </View>
            <Text style={[styles.petName, { color: ui.subtle }]}>Add</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>This week</Text>
          <Pressable onPress={() => navigation.navigate('Health')}>
            <Text style={styles.sectionLink}>Health</Text>
          </Pressable>
        </View>
        <Card style={styles.weekCard}>
          {weekItems.length === 0 ? (
            <Text style={styles.emptyText}>Nothing scheduled this week.</Text>
          ) : (
            weekItems.map((item, i) => (
              <View
                key={item.key}
                style={[styles.weekRow, i < weekItems.length - 1 && styles.rowDivider]}
              >
                <View style={styles.dayCol}>
                  <Text style={styles.dayLabel}>{DAYS[item.date.getDay()]}</Text>
                  <Text style={styles.dayDate}>{item.date.getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSub}>{item.sub}</Text>
                </View>
                <View style={[styles.weekDot, { backgroundColor: item.dot }]} />
              </View>
            ))
          )}
        </Card>

        <Pressable
          onPress={() => navigation.navigate('Community')}
          style={({ pressed }) => pressed && { opacity: 0.9 }}
        >
          <Card style={styles.teaser}>
            <MaterialCommunityIcons name="forum-outline" size={20} color={ui.accent} />
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 22,
  },
  bell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#b06e00',
    borderWidth: 2,
    borderColor: ui.background,
  },
  hero: { marginHorizontal: 24, marginBottom: 26 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginHorizontal: 24,
    marginBottom: 14,
  },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: ui.ink },
  sectionLink: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.accent },
  petsRow: { gap: 20, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 20 },
  petItem: { alignItems: 'center', gap: 8 },
  petName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: ui.ink },
  addCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ui.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCard: { marginHorizontal: 24, marginBottom: 24 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  dayCol: { width: 40, alignItems: 'center' },
  dayLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: ui.subtle },
  dayDate: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: ui.ink },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub },
  weekDot: { width: 8, height: 8, borderRadius: 4 },
  emptyText: {
    padding: 18,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: ui.subtle,
  },
  teaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  teaserText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13.5,
    color: ui.ink,
  },
  teaserBold: { fontFamily: 'PlusJakartaSans_700Bold' },
});
