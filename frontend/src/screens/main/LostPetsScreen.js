import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Linking, Pressable, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ui, type, PET_COLOR_PAIRS, motion } from '../../theme';
import { Card, Button, ConfirmDialog, showToast } from '../../components';

// Redesign: this pushed screen is now the report/manage surface — the board
// itself lives inline in Community's "Lost pets" section. Report form on top,
// then your active reports (mark as found), then everyone else's.

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function missingFor(iso) {
  if (!iso) return 'Missing';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'Missing today';
  return `Missing ${days} day${days === 1 ? '' : 's'}`;
}

const petFg = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg)?.fg ?? ui.accent;

export default function LostPetsScreen({ navigation }) {
  const {
    pets, lostPets, myReports, refreshLostPets, reportPetLost, resolveLostPet,
  } = useData();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState(null);
  const [lastSeen, setLastSeen] = useState('');
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, action }

  useEffect(() => { refreshLostPets(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLostPets();
    setRefreshing(false);
  }, [refreshLostPets]);

  const activeReports = myReports.filter((r) => r.status !== 'resolved');
  const reportedPetIds = new Set(activeReports.map((r) => r.petId));
  const otherReports = lostPets.filter((r) => r.reportedBy !== user?.id);

  const selectPet = (pet) => {
    if (reportedPetIds.has(pet.id)) {
      showToast(`${pet.name} is already on the board`);
      return;
    }
    setSelectedPetId((prev) => (prev === pet.id ? null : pet.id));
  };

  const handleSubmit = async () => {
    if (!selectedPetId || submitting) return;
    const pet = pets.find((p) => p.id === selectedPetId);
    setSubmitting(true);
    await reportPetLost(selectedPetId, {
      lastSeenLocation: lastSeen.trim(),
      description: note.trim(),
      contactPhone: phone.trim(),
    });
    setSubmitting(false);
    setSelectedPetId(null);
    setLastSeen('');
    setNote('');
    setPhone('');
    showToast(`${pet?.name || 'Your pet'} posted to the board`);
  };

  const handleMarkFound = (report) => setConfirm({
    title: 'Mark as found?',
    message: `Has ${report.petName} been found safe?`,
    confirmLabel: 'Found!',
    action: async () => { await resolveLostPet(report.id); showToast('Welcome home!', { celebrate: true, actionType: 'lost_pet_found' }); },
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { borderColor: ui.faint }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Report missing pet</Text>
        </View>
        <Text style={styles.intro}>
          Your report is shared with owners nearby. Most pets are reunited within 48 hours.
        </Text>

        {/* Report form */}
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>Which pet?</Text>
            {pets.length === 0 ? (
              <Text style={styles.noPets}>Add a pet to your profile first, then report it here.</Text>
            ) : (
              <View style={styles.petChips}>
                {pets.map((pet) => {
                  const selected = selectedPetId === pet.id;
                  const reported = reportedPetIds.has(pet.id);
                  return (
                    <Pressable
                      key={pet.id}
                      onPress={() => selectPet(pet)}
                      style={[
                        styles.petChip,
                        selected && styles.petChipSelected,
                        reported && { opacity: 0.45 },
                      ]}
                    >
                      <View style={[styles.petChipAvatar, { backgroundColor: pet.color || ui.accentTint }]}>
                        <Text style={[styles.petChipInitial, { color: petFg(pet.color) }]}>
                          {(pet.name || '?')[0]}
                        </Text>
                      </View>
                      <Text style={styles.petChipLabel}>{pet.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View>
            <Text style={styles.fieldLabel}>Last seen</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Marina Park, near the fountain"
              placeholderTextColor={ui.subtle}
              value={lastSeen}
              onChangeText={setLastSeen}
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Anything helpers should know</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Collar color, temperament, responds to…"
              placeholderTextColor={ui.subtle}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Contact number</Text>
            <TextInput
              style={styles.input}
              placeholder="So helpers can reach you"
              placeholderTextColor={ui.subtle}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <Button
            label={submitting ? 'Posting…' : 'Post to the board'}
            onPress={handleSubmit}
            disabled={!selectedPetId || submitting}
          />
        </View>

        {/* Your active reports */}
        {activeReports.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your active reports</Text>
            {activeReports.map((r) => (
              <Card key={r.id} padded style={styles.reportCard}>
                <View style={styles.reportTitleRow}>
                  <Text style={styles.reportTitle} numberOfLines={1}>
                    {r.petName}
                    {r.petType ? ` — ${r.petType}` : ''}
                  </Text>
                  <Text style={styles.reportMissing}>{missingFor(r.createdAt)}</Text>
                </View>
                {r.lastSeenLocation ? (
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={15} color={ui.subtle} />
                    <Text style={styles.metaText}>Last seen near {r.lastSeenLocation}</Text>
                  </View>
                ) : null}
                {r.description ? <Text style={styles.reportDesc}>{r.description}</Text> : null}
                <Pressable
                  onPress={() => handleMarkFound(r)}
                  style={({ pressed }) => [styles.foundBtn, pressed && { opacity: motion.pressOpacitySoft }]}
                >
                  <Text style={styles.foundBtnText}>Mark as found</Text>
                </Pressable>
              </Card>
            ))}
          </View>
        )}

        {/* Other reports */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Reported nearby</Text>
          {otherReports.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="heart-outline" size={30} color={ui.faint} />
              <Text style={styles.emptyTitle}>No pets reported lost</Text>
              <Text style={styles.emptyText}>Good news — every pet in the community is home safe.</Text>
            </View>
          ) : (
            otherReports.map((r) => (
              <Card key={r.id} padded style={styles.reportCard}>
                <View style={styles.reportTitleRow}>
                  <Text style={styles.reportTitle} numberOfLines={1}>
                    {r.petName}
                    {r.petType ? ` — ${r.petType}` : ''}
                  </Text>
                  <Text style={styles.reportMissing}>{missingFor(r.createdAt)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <MaterialCommunityIcons name="account-outline" size={15} color={ui.subtle} />
                  <Text style={styles.metaText}>
                    Reported by {r.reporterName || 'someone'} · {timeAgo(r.createdAt)}
                  </Text>
                </View>
                {r.lastSeenLocation ? (
                  <View style={styles.metaRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={15} color={ui.subtle} />
                    <Text style={styles.metaText}>Last seen near {r.lastSeenLocation}</Text>
                  </View>
                ) : null}
                {r.description ? <Text style={styles.reportDesc}>{r.description}</Text> : null}
                {r.contactPhone ? (
                  <Button
                    icon="phone"
                    label="Contact owner"
                    onPress={() => Linking.openURL(`tel:${r.contactPhone}`).catch(() => {})}
                  />
                ) : null}
              </Card>
            ))
          )}
        </View>
      </ScrollView>

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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    letterSpacing: -0.3,
    color: ui.ink,
  },
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
    paddingVertical: 7,
    paddingRight: 14,
    paddingLeft: 7,
    borderRadius: 999,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
  },
  petChipSelected: { backgroundColor: ui.accentTint, borderColor: ui.accent },
  petChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petChipInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11 },
  petChipLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
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
  reportCard: { gap: 12 },
  reportTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  reportTitle: { flex: 1, fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 16, color: ui.ink },
  reportMissing: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.danger },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: ui.subtle, flex: 1 },
  reportDesc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 19, color: ui.sub },
  foundBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ui.successTint,
  },
  foundBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.success },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  emptyTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: ui.ink, marginTop: 6 },
  emptyText: { ...type.secondary, color: ui.sub, textAlign: 'center' },
});
