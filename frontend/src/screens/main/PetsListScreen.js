import React, { useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePetRecordsQuery } from '../../hooks/usePetRecords';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { petMeta, petPhoto } from '../../utils/pets';
import { useTranslation } from '../../i18n';
import { ui, type, photos } from '../../theme';
import { Button, EmptyState, PetCard, Skeleton, petHealthStatus } from '../../components';

// "Lively & Light": pets as a 2-column grid of photo cards on their identity
// tints — recognised by face and color first. Status shows once per pet (icon
// + word on the card); pets that need attention sort first. The whole card
// navigates, and adding is a quiet outline tile, never a banner.

// Stable while nothing has loaded, so the sort memo doesn't rerun.
const NO_PETS = [];

// Unknown (vaccinations didn't load) sorts with "due": it needs a look.
const SEVERITY = { overdue: 0, due: 1, unknown: 1, ok: 2 };
// A pet whose vaccinations didn't load has no known status: no badge, never
// "All good" (Home's rule too).
const healthOf = (pet) => (pet.missing?.includes('vaccinations')
  ? { status: null, label: null, severity: SEVERITY.unknown }
  : { ...petHealthStatus(pet.vaccinations), severity: undefined });

export default function PetsListScreen({ navigation }) {
  // The full pet records, as every pet screen sees them: DataContext's writes
  // land in the same cache, and a stale list re-reads on focus (edits made on
  // another phone sharing a pet).
  const { t } = useTranslation();
  const {
    data, isLoading, isError, isStale, refetch,
  } = usePetRecordsQuery();
  const pets = data ?? NO_PETS;
  useRefetchOnFocus(refetch, { isStale });

  const sorted = useMemo(
    () =>
      pets
        .map((pet, i) => ({ pet, i, health: healthOf(pet) }))
        .sort((a, b) => (a.health.severity ?? SEVERITY[a.health.status])
          - (b.health.severity ?? SEVERITY[b.health.status]) || a.i - b.i)
        // An odd count gets a spacer so the last card keeps its column width.
        .concat(pets.length % 2 ? [{ spacer: true }] : []),
    [pets],
  );

  const addPet = () => navigation.navigate('AddPet');

  const renderPet = ({ item: { pet, health, spacer } }) => (spacer ? <View style={styles.spacer} /> : (
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
      <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">{t('pets.title')}</Text>
      <Text style={styles.pageSubtitle}>
        {t('pets.subtitle', { count: pets.length })}
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
      <Text style={styles.addCardText}>{t('pets.addAnother')}</Text>
    </Pressable>
  );

  if (isLoading) {
    // Real header, skeleton cards where the data goes — no layout jump when
    // the grid lands.
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.list}>
          <View style={styles.headerWrap}>
            <Text style={[type.screenTitle, { color: ui.ink }]}>{t('pets.title')}</Text>
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

  // Failed with nothing to show: a failed re-read keeps the pets it has.
  if (isError && data === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('pets.loadFailed')}</Text>
          <Button variant="ghost" label={t('pets.tryAgain')} onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (pets.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.list, { flex: 1 }]}>
          <View style={styles.headerWrap}>
            <Text style={[type.screenTitle, { color: ui.ink }]} accessibilityRole="header">{t('pets.title')}</Text>
          </View>
          <View style={styles.centered}>
            <EmptyState
              photo={photos.emptyKitten}
              title={t('pets.emptyTitle')}
              body={t('pets.emptyBody')}
              actionLabel={t('pets.emptyAction')}
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
  // flexDirection for the loading skeleton's rows (FlatList's column wrapper
  // already lays the real rows out horizontally).
  row: { flexDirection: 'row', gap: 12 },
  // Same horizontal padding as PetCard: Yoga floors a flex: 1 item at its
  // padding, so an unpadded spacer would let a lone last card grow 16px wider.
  spacer: { flex: 1, paddingHorizontal: 8 },
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
