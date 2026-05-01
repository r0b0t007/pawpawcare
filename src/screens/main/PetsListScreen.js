import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

function statusBadge(vax) {
  if (!vax || vax.length === 0) return null;
  const overdue = vax.find((v) => v.status === 'overdue');
  if (overdue) return { label: 'Overdue', bg: colors.errorContainer, fg: colors.onErrorContainer };
  const due = vax.find((v) => v.status === 'due_soon');
  if (due) return { label: 'Due Soon', bg: '#fff0c3', fg: '#7a5c00' };
  const upcoming = vax.find((v) => v.status === 'upcoming');
  if (upcoming) return { label: 'Upcoming', bg: colors.tertiaryFixed, fg: colors.onTertiaryFixed };
  return null;
}

export default function PetsListScreen({ navigation }) {
  const { pets, deletePet } = useData();

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
        activeOpacity={0.85}
      >
        <View style={[styles.decor, { backgroundColor: pet.color || colors.primaryFixed }]} />
        <View style={styles.cardContent}>
          <View style={[styles.avatar, { backgroundColor: pet.color || colors.primaryFixed }]}>
            <Text style={styles.avatarText}>{pet.name[0]}</Text>
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <View>
                <Text style={styles.petName}>{pet.name}</Text>
                <Text style={styles.petBreed}>{pet.breed} • {pet.age} yr{pet.age !== 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(pet)} style={styles.more}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {badge && (
              <View style={styles.badgeRow}>
                <MaterialCommunityIcons name="needle" size={14} color={badge.fg} />
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('PetProfile', { petId: pet.id })}
            >
              <Text style={styles.profileBtnText}>View Profile</Text>
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
        <Text style={styles.pageSubtitle}>Manage your furry friends' profiles.</Text>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddPet')}>
        <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
        <Text style={styles.addBtnText}>Add Pet</Text>
      </TouchableOpacity>
    </View>
  );

  const ListFooter = () => (
    <TouchableOpacity style={styles.addCard} onPress={() => navigation.navigate('AddPet')}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceContainerHigh }]}>
        <MaterialCommunityIcons name="plus" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.petName, { color: colors.primary, marginTop: spacing.sm }]}>New Family Member?</Text>
      <Text style={[styles.petBreed, { textAlign: 'center', marginTop: spacing.xs }]}>Add another pet to your dashboard.</Text>
    </TouchableOpacity>
  );

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
  list: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl },
  headerWrap: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  pageTitle: { ...typography.headlineLg, color: colors.onBackground, marginBottom: spacing.xs },
  pageSubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.lg, ...shadows.strong,
  },
  addBtnText: { ...typography.labelMd, color: colors.onPrimary },
  card: {
    backgroundColor: colors.surfaceContainerLowest, borderRadius: radii.xl,
    overflow: 'hidden', ...shadows.card,
    borderWidth: 1, borderColor: colors.surfaceContainerLow,
  },
  decor: {
    position: 'absolute', top: -16, right: -16,
    width: 80, height: 80, borderRadius: radii.full, opacity: 0.3,
  },
  cardContent: { padding: spacing.md, flexDirection: 'row', gap: spacing.md },
  avatar: {
    width: 72, height: 72, borderRadius: radii.full,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: colors.surfaceContainerLowest,
  },
  avatarText: { ...typography.headlineMd, color: colors.primaryContainer },
  info: { flex: 1, gap: spacing.sm },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  petName: { ...typography.titleLg, color: colors.onSurface, marginBottom: 2 },
  petBreed: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  more: { padding: spacing.xs },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.full },
  badgeText: { ...typography.labelSm },
  profileBtn: {
    backgroundColor: colors.secondaryFixed,
    paddingVertical: spacing.sm, borderRadius: radii.lg,
    alignItems: 'center',
  },
  profileBtnText: { ...typography.labelMd, color: colors.onSecondaryFixed },
  addCard: {
    backgroundColor: colors.surfaceContainerLowest, borderRadius: radii.xl,
    padding: spacing.lg, alignItems: 'center',
    borderWidth: 2, borderColor: colors.outlineVariant, borderStyle: 'dashed',
  },
});
