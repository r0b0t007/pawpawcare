import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, Linking, Pressable, TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../../context/DataContext';
import { usePetRecords } from '../../hooks/usePetRecords';
import { useAuth } from '../../context/AuthContext';
import { ui, type, photos } from '../../theme';
import { Button, ConfirmDialog, EmptyState, PetFace, showToast, ScreenHeader, FormScrollView } from '../../components';
import LostPetCard from './LostPetCard';
import { isMyReport } from '../../utils/pets';
import { useInFlight } from '../../hooks/useInFlight';
import { useLostPetsBoardQuery, useMyLostReportsQuery } from '../../hooks/useLostPets';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useLocale, useTranslation } from '../../i18n';

// Redesign: this pushed screen is now the report/manage surface — the board
// itself lives inline in Community's "Lost pets" section. Report form on top,
// then your active reports (mark as found), then everyone else's.

export default function LostPetsScreen({ navigation }) {
  // Kept above the keyboard by FormScrollView (CHW-154).
  const submitRef = useRef(null);
  // Re-render dates and times when the app language changes: this screen
  // can stay mounted under another tab while the language is switched.
  useLocale();
  const { t } = useTranslation();
  const { reportPetLost, resolveLostPet } = useData();
  const pets = usePetRecords();
  const {
    data: lostPets = [], isLoading: boardLoading, isError: boardFailed, isStale: boardStale,
    refetch: refetchBoard,
  } = useLostPetsBoardQuery();
  const { data: myReports = [], refetch: refetchMine } = useMyLostReportsQuery();
  // Back from a pet's profile: pick up reports changed meanwhile.
  useRefetchOnFocus(refetchBoard, { isStale: boardStale });
  useRefetchOnFocus(refetchMine);
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState(null);
  const [lastSeen, setLastSeen] = useState('');
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, action }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBoard(), refetchMine()]);
    setRefreshing(false);
  }, [refetchBoard, refetchMine]);

  const activeReports = myReports.filter((r) => r.status !== 'resolved');
  const reportedPetIds = new Set(activeReports.map((r) => r.petId));
  const otherReports = lostPets.filter((r) => !isMyReport(r, user?.id));

  const selectPet = (pet) => {
    if (reportedPetIds.has(pet.id)) {
      showToast(t('lostPets.alreadyOnBoard', { name: pet.name }));
      return;
    }
    setSelectedPetId((prev) => (prev === pet.id ? null : pet.id));
  };

  // A double tap would post two public reports: one request per tap, and the
  // form clears only once the report is actually on the board.
  const { run, isBusy } = useInFlight();
  const submitting = isBusy('report');
  const handleSubmit = () => {
    if (!selectedPetId) return undefined;
    // The tap no longer closes the keyboard (FormScrollView); close it so the
    // result toast isn't hidden behind it.
    Keyboard.dismiss();
    const pet = pets.find((p) => p.id === selectedPetId);
    return run('report', async () => {
      const saved = await reportPetLost(selectedPetId, {
        lastSeenLocation: lastSeen.trim(),
        description: note.trim(),
        contactPhone: phone.trim(),
      });
      if (!saved) {
        showToast(pet?.name ? t('lostPets.postFailed', { name: pet.name }) : t('lostPets.postFailedNoName'));
        return;
      }
      setSelectedPetId(null);
      setLastSeen('');
      setNote('');
      setPhone('');
      showToast(pet?.name ? t('lostPets.posted', { name: pet.name }) : t('lostPets.postedNoName'));
    });
  };

  const handleMarkFound = (report) => setConfirm({
    title: t('lostPets.markFound.title'),
    message: t('lostPets.markFound.message', { name: report.petName }),
    confirmLabel: t('lostPets.markFound.confirm'),
    action: async () => {
      if (await resolveLostPet(report.id)) showToast(t('lostPets.markFound.success'), { celebrate: true, actionType: 'lost_pet_found' });
      else showToast(t('lostPets.markFound.failed'));
    },
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView
        contentContainerStyle={styles.scroll}
        keepVisible={submitRef}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {/* Header */}
        <ScreenHeader title={t('lostPets.title')} onBack={() => navigation.goBack()} flush style={{ paddingBottom: 8 }} />
        <Text style={styles.intro}>
          {t('lostPets.intro')}
        </Text>

        {/* Report form */}
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>{t('lostPets.whichPet')}</Text>
            {pets.length === 0 ? (
              <Text style={styles.noPets}>{t('lostPets.noPets')}</Text>
            ) : (
              <View style={styles.petChips}>
                {pets.map((pet) => {
                  const selected = selectedPetId === pet.id;
                  const reported = reportedPetIds.has(pet.id);
                  return (
                    <Pressable
                      key={pet.id}
                      onPress={() => selectPet(pet)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: reported }}
                      style={[
                        styles.petChip,
                        selected && styles.petChipSelected,
                        reported && { opacity: 0.45 },
                      ]}
                    >
                      <PetFace pet={pet} size={28} ring={false} />
                      <Text style={styles.petChipLabel}>{pet.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('lostPets.lastSeen')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('lostPets.lastSeenPlaceholder')}
              placeholderTextColor={ui.placeholder}
              value={lastSeen}
              onChangeText={setLastSeen}
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('lostPets.notes')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder={t('lostPets.notesPlaceholder')}
              placeholderTextColor={ui.placeholder}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('lostPets.contact')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('lostPets.contactPlaceholder')}
              placeholderTextColor={ui.placeholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View ref={submitRef} collapsable={false}>
            <Button
              label={submitting ? t('lostPets.posting') : t('lostPets.submit')}
              onPress={handleSubmit}
              disabled={!selectedPetId || submitting}
            />
          </View>
        </View>

        {/* Your active reports */}
        {activeReports.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('lostPets.yourReports')}</Text>
            {activeReports.map((r) => (
              <LostPetCard key={r.id} report={r} mine onFound={() => handleMarkFound(r)} />
            ))}
          </View>
        )}

        {/* Other reports */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('lostPets.nearby')}</Text>
          {otherReports.length === 0 && boardFailed && (
            <EmptyState
              compact
              title={t('lostPets.loadFailed')}
              actionLabel={t('common.retry')}
              actionIcon="refresh"
              onAction={() => refetchBoard()}
              style={{ paddingVertical: 12 }}
            />
          )}
          {otherReports.length === 0 && !boardLoading && !boardFailed && (
            <EmptyState
              compact
              photo={photos.communityPals}
              title={t('lostPets.emptyTitle')}
              body={t('lostPets.emptyBody')}
              style={{ paddingVertical: 12 }}
            />
          )}
          {otherReports.length > 0 && (
            otherReports.map((r) => (
              <LostPetCard
                key={r.id}
                report={r}
                showReporter
                // Contact only when the owner shared a number — never a dead button.
                onSeen={r.contactPhone
                  ? () => Linking.openURL(`tel:${r.contactPhone}`).catch(() => {})
                  : undefined}
                seenLabel={t('lostPets.contactOwner')}
                seenIcon="phone"
              />
            ))
          )}
        </View>
      </FormScrollView>

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const a = confirm?.action; setConfirm(null); a?.(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  // The scroll already pads the sides and top.
  intro: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: ui.sub,
    marginBottom: 22,
  },
  form: { gap: 20 },
  fieldLabel: { ...type.sectionLabel, color: ui.subtle, marginBottom: 8 },
  noPets: { ...type.secondary, color: ui.sub },
  petChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingVertical: 7,
    paddingRight: 14,
    paddingLeft: 7,
    borderRadius: 999,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
  },
  petChipSelected: { backgroundColor: ui.accentTint, borderColor: ui.accent },
  petChipLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
  input: {
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  section: { marginTop: 28, gap: 12 },
  sectionLabel: { ...type.sectionLabel, color: ui.subtle },
});
