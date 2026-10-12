import React, { useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePetsQuery } from '../../hooks/usePets';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { petMeta, petPhoto } from '../../utils/pets';
import { ui, type, photos } from '../../theme';
import { Button, EmptyState, PetCard, Skeleton, petHealthStatus } from '../../components';

// "Lively & Light": pets as a 2-column grid of photo cards on their identity
// tints — recognised by face and color first. Status shows once per pet (icon
// + word on the card); pets that need attention sort first. The whole card
// navigates, and adding is a quiet outline tile, never a banner.

const SEVERITY = { overdue: 0, due: 1, ok: 2 };

export default function PetsListScreen({ navigation }) {
  // Reads come from React Query; writes still go through DataContext, which
  // invalidates the pets query (see queryKeys.js) so this list refetches.
  const { data: pets = [], isLoading, isError, refetch } = usePetsQuery();
  useRefetchOnFocus(refetch);

  const sorted = useMemo(
    () =>
      pets
        .map((pet, i) => ({ pet, i, health: petHealthStatus(pet.vaccinations) }))
        .sort((a, b) => SEVERITY[a.health.status] - SEVERITY[b.health.status] || a.i - b.i)
        // An odd count gets a spacer so the last card keeps its column width.
        .concat(pets.length % 2 ? [{ spacer: true }] : []),
    [pets],
  );

  const addPet = () => navigation.navigate('AddPet');

  const renderPet = ({ item: { pet, health, spacer } }) => (spacer ? <View style={{ flex: 1 }} /> : (
    <PetCard
      name={pet.name}
      meta={petMeta(pet)}
      color={pet.color}
      photo={petPhoto(pet)}
      species={pet.type}
      status={health.status}
      statusLabel={health.label}
      onPress={() => navigation.navigate('PetProfile', { petId: pet.id })}
    />
  ));

  const ListHeader = (
    <View style={styles.headerWrap}>
      <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">Your pets</Text>
      <Text style={styles.pageSubtitle}>
        {pets.length === 1 ? "1 pet · tap to see today's care" : `${pets.length} pets · tap one to see today's care`}
      </Text>
    </View>
  );

  const ListFooter = (
    <Pressable
      style={({ pressed }) => [styles.addCard, pressed && { backgroundColor: ui.pressTint }]}
      onPress={addPet}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name="plus" size={20} color={ui.accent} />
      <Text style={styles.addCardText}>Add another pet</Text>
    </Pressable>
  );

  if (isLoading) {
    // Real header, skeleton cards where the data goes — no layout jump when
    // the grid lands.
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.list}>
          <View style={styles.headerWrap}>
            <Text style={[type.screenTitle, { color: ui.ink }]}>Your pets</Text>
            <Skeleton width={150} height={12} style={{ marginTop: 8 }} />
          </View>
          {[0, 1].map((r) => (
            <View key={r} style={styles.row}>
              {[0, 1].map((c) => (
                <View key={c} style={styles.skeletonCard}>
                  <Skeleton width="100%" height={128} radius={16} />
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="45%" height={11} />
                </View>
              ))}
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

  if (pets.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.list, { flex: 1 }]}>
          <View style={styles.headerWrap}>
            <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">Your pets</Text>
          </View>
          <View style={styles.centered}>
            <EmptyState
              photo={photos.emptyKitten}
              title="No pets yet"
              body="Add a cat, a dog or any companion. It takes less than a minute."
              actionLabel="Add your first pet"
              actionIcon="plus"
              onAction={addPet}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Plain FlatList: Reanimated's itemLayoutAnimation is single-column
          only, and this grid is two. */}
      <FlatList
        data={sorted}
        keyExtractor={({ pet, spacer }) => (spacer ? 'spacer' : pet.id)}
        renderItem={renderPet}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { ...type.body, color: ui.sub },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  row: { gap: 12 },
  headerWrap: { paddingTop: 14, paddingBottom: 6, paddingHorizontal: 8 },
  pageSubtitle: { ...type.body, color: ui.sub, marginTop: 2 },
  skeletonCard: {
    flex: 1,
    gap: 10,
    padding: 8,
    borderRadius: 22,
    backgroundColor: ui.track,
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
    borderCurve: 'continuous',
    minHeight: 56,
    marginTop: 4,
  },
  addCardText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.accent },
});
