import React from 'react';
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePetsQuery } from '../../hooks/usePets';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { resolveAsset } from '../../config';
import { ui, type, PET_COLOR_PAIRS } from '../../theme';
import { StatusRing, StatusPill, Button, Skeleton } from '../../components';

// Reflow only — no entering on virtualized rows (recycling makes them flicker).
const ROW_LAYOUT = LinearTransition.duration(200);

// Redesign: the whole card navigates (no "View Profile" button), status lives
// on the ring + one pill, and delete moved off the browse path into EditPet.

function petStatus(vax = []) {
  const overdueCount = vax.filter((v) => v.status === 'overdue').length;
  if (overdueCount > 0) {
    return { status: 'overdue', label: `${overdueCount} overdue` };
  }
  if (vax.some((v) => v.status === 'due_soon')) return { status: 'due', label: 'Due soon' };
  return { status: 'ok', label: 'All good' };
}

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

const petMeta = (pet) =>
  [
    pet.type ? pet.type.charAt(0).toUpperCase() + pet.type.slice(1) : null,
    pet.breed || null,
    pet.age ? `${pet.age} yr${pet.age !== 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

export default function PetsListScreen({ navigation }) {
  // Reads come from React Query; writes still go through DataContext, which
  // invalidates the pets query (see queryKeys.js) so this list refetches.
  const { data: pets = [], isLoading, isError, refetch } = usePetsQuery();
  useRefetchOnFocus(refetch);

  const renderPet = ({ item: pet }) => {
    const { status, label } = petStatus(pet.vaccinations);
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { borderColor: '#d9c6a8' }]}
        onPress={() => navigation.navigate('PetProfile', { petId: pet.id })}
      >
        <StatusRing
          size={56}
          color={pet.color || ui.accentTint}
          textColor={petFg(pet.color)}
          initial={pet.name[0]}
          photo={pet.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined}
          status={status}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.petName}>{pet.name}</Text>
          {petMeta(pet) ? (
            <Text style={styles.petMeta} numberOfLines={1}>
              {petMeta(pet)}
            </Text>
          ) : null}
          <StatusPill status={status} label={label} style={{ marginTop: 8 }} />
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={ui.faint} />
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View style={styles.headerWrap}>
      <View>
        <Text style={[type.screenTitle, { color: ui.ink }]}>Your pets</Text>
        <Text style={styles.pageSubtitle}>
          {pets.length === 0
            ? 'Add your first pet below'
            : `${pets.length} in your care`}
        </Text>
      </View>
      <Button pill icon="plus" label="Add pet" onPress={() => navigation.navigate('AddPet')} />
    </View>
  );

  const ListFooter = () => (
    <Pressable
      style={({ pressed }) => [styles.addCard, pressed && { backgroundColor: ui.pressTint }]}
      onPress={() => navigation.navigate('AddPet')}
    >
      <MaterialCommunityIcons name="plus" size={20} color={ui.accent} />
      <Text style={styles.addCardText}>Add a pet</Text>
    </Pressable>
  );

  if (isLoading) {
    // Real header, skeleton cards where the data goes — no layout jump when
    // the list lands.
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.list}>
          <View style={styles.headerWrap}>
            <View>
              <Text style={[type.screenTitle, { color: ui.ink }]}>Your pets</Text>
              <Skeleton width={110} height={12} style={{ marginTop: 8 }} />
            </View>
            <Button pill icon="plus" label="Add pet" onPress={() => navigation.navigate('AddPet')} />
          </View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton width={56} height={56} radius={28} />
              <View style={{ flex: 1, gap: 9 }}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="40%" height={11} />
                <Skeleton width={82} height={22} radius={11} style={{ marginTop: 2 }} />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load your pets.</Text>
          <Button variant="ghost" label="Try again" onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Animated.FlatList
        data={pets}
        keyExtractor={(p) => p.id}
        renderItem={renderPet}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        itemLayoutAnimation={ROW_LAYOUT}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { ...type.body, color: ui.sub },
  list: { paddingHorizontal: 24, paddingBottom: 28, gap: 14 },
  headerWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 6,
  },
  pageSubtitle: { ...type.body, color: ui.sub, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  petName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: ui.ink },
  petMeta: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    color: ui.sub,
    marginTop: 2,
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ui.faint,
    borderRadius: 20,
    padding: 18,
  },
  addCardText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.accent },
});
