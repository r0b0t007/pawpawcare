import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { usePetsQuery, useRefetchOnFocus } from '../../hooks/usePets';
import { resolveAsset } from '../../config';
import { colors, typography, spacing, radii, shadows } from '../../theme';

function statusBadge(vax) {
  if (!vax || vax.length === 0) return null;
  const overdue = vax.find((v) => v.status === 'overdue');
  if (overdue) return { label: 'Overdue', bg: colors.errorContainer, fg: colors.onErrorContainer, dot: colors.error };
  const due = vax.find((v) => v.status === 'due_soon');
  if (due) return { label: 'Due Soon', bg: colors.dueSoonBg, fg: colors.dueSoonFg, dot: '#d4a000' };
  const upcoming = vax.find((v) => v.status === 'upcoming');
  if (upcoming) return { label: 'Upcoming', bg: colors.tertiaryFixed, fg: colors.onTertiaryFixed, dot: colors.tertiary };
  return null;
}

export default function PetsListScreen({ navigation }) {
  // Reads come from React Query; writes still go through DataContext, which
  // invalidates the pets query (see queryKeys.js) so this list refetches.
  const { deletePet } = useData();
  const { data: pets = [], isLoading, isError, refetch } = usePetsQuery();
  useRefetchOnFocus(refetch);

  const confirmDelete = (pet) => {
    Alert.alert(
      'Remove Pet',
      `Are you sure you want to remove ${pet.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deletePet(pet.id) },
      ]
    );
  };

  const renderPet = ({ item: pet }) => {
    const badge = statusBadge(pet.vaccinations);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('PetProfile', { petId: pet.id })}
        activeOpacity={0.88}
      >
        {/* Color accent strip */}
        <View style={[styles.colorStrip, { backgroundColor: pet.color || colors.primaryFixed }]} />
        <View style={styles.cardContent}>
          <View style={[styles.avatar, { backgroundColor: pet.color || colors.primaryFixed }]}>
            {pet.avatarUrl ? (
              <Image source={{ uri: resolveAsset(pet.avatarUrl) }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{pet.name[0]}</Text>
            )}
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{pet.name}</Text>
                <Text style={styles.petBreed}>
                  {pet.type ? pet.type.charAt(0).toUpperCase() + pet.type.slice(1) : ''}{pet.breed ? ` · ${pet.breed}` : ''}{pet.age ? ` · ${pet.age} yr${pet.age !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => confirmDelete(pet)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {badge && (
              <View style={styles.badgeRow}>
                <View style={[styles.statusDot, { backgroundColor: badge.dot }]} />
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('PetProfile', { petId: pet.id })}
              activeOpacity={0.88}
            >
              <Text style={styles.profileBtnText}>View Profile</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={colors.onSecondaryFixed} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <View style={styles.headerWrap}>
      <View>
        <Text style={styles.pageTitle}>My Pets</Text>
        <Text style={styles.pageSubtitle}>
          {pets.length === 0 ? 'Add your first pet below' : `${pets.length} pet${pets.length !== 1 ? 's' : ''} in your care`}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddPet')}
        activeOpacity={0.88}
      >
        <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
        <Text style={styles.addBtnText}>Add Pet</Text>
      </TouchableOpacity>
    </View>
  );

  const ListFooter = () => (
    <TouchableOpacity
      style={styles.addCard}
      onPress={() => navigation.navigate('AddPet')}
      activeOpacity={0.88}
    >
      <View style={[styles.addCardIcon, { backgroundColor: colors.primaryFixed }]}>
        <MaterialCommunityIcons name="plus" size={28} color={colors.primaryContainer} />
      </View>
      <Text style={styles.addCardTitle}>New Family Member?</Text>
      <Text style={styles.addCardSub}>Add another pet to your profile</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load your pets.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.88}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={pets}
        keyExtractor={(p) => p.id}
        renderItem={renderPet}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
  },
  retryBtnText: { ...typography.labelMd, color: colors.onPrimary },
  list: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl },
  headerWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  pageTitle: { ...typography.headlineLg, color: colors.onBackground, marginBottom: spacing.xs },
  pageSubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    ...shadows.button,
  },
  addBtnText: { ...typography.labelMd, color: colors.onPrimary },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerLow,
  },
  colorStrip: { height: 6, width: '100%' },
  cardContent: { padding: spacing.md, flexDirection: 'row', gap: spacing.md },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
    ...shadows.card,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { ...typography.headlineMd, color: colors.primaryContainer, fontSize: 28 },
  info: { flex: 1, gap: spacing.sm },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { ...typography.titleLg, color: colors.onSurface, marginBottom: 2 },
  petBreed: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 13 },
  deleteBtn: { padding: spacing.xs },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: radii.full },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  badgeText: { ...typography.labelSm, fontFamily: 'PlusJakartaSans_600SemiBold' },
  profileBtn: {
    backgroundColor: colors.secondaryFixed,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  profileBtnText: { ...typography.labelMd, color: colors.onSecondaryFixed },
  addCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
  },
  addCardIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  addCardTitle: { ...typography.titleLg, color: colors.primaryContainer },
  addCardSub: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 14 },
});
