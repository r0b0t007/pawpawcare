import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getPref, setPref } from '../../services/prefs';
import { scheduleLocalReminders, cancelAllLocalReminders } from '../../services/notifications';
import { exportRecords } from '../../services/exportRecords';
import { ui, type } from '../../theme';
import { Card, ListRow, ConfirmDialog, Sheet, Chip, Button, showToast } from '../../components';

// The Profile tab: account card (+ Edit → AccountDetails), notification
// toggles, sharing entry points and a guarded log out.

export default function ProfileScreen({ navigation }) {
  const { user, isAdmin, logout, updateUser } = useAuth();
  const { invites, reminders, pets } = useData();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [careReminders, setCareReminders] = useState(true);
  const [communityDigest, setCommunityDigest] = useState(true);

  // Export center — sheet state lives here; the download/share plumbing is in
  // services/exportRecords.js.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportPets, setExportPets] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getPref('careReminders', true), getPref('communityDigest', true)]).then(
      ([care, digest]) => {
        if (!alive) return;
        setCareReminders(!!care);
        setCommunityDigest(!!digest);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // Real behavior: OFF cancels every pending local notification; ON reschedules
  // from the current reminder list (scheduleLocalReminders reads the pref, so
  // persist first).
  const toggleCareReminders = async (value) => {
    setCareReminders(value);
    await setPref('careReminders', value);
    if (value) {
      scheduleLocalReminders(reminders);
    } else {
      cancelAllLocalReminders();
    }
  };

  // Device-local preference only — there is no digest backend yet, so nothing
  // else to wire.
  const toggleCommunityDigest = (value) => {
    setCommunityDigest(value);
    setPref('communityDigest', value);
  };

  // SERVER-side switch (unlike the prefs above): birthday / gotcha-day /
  // weekly-recap pushes originate on the server, so the opt-out must live
  // there. Optimistic UI; updateUser refreshes the stored user on success.
  const [engagementPushes, setEngagementPushes] = useState(user?.engagement_pushes_enabled !== false);
  const toggleEngagementPushes = (value) => {
    setEngagementPushes(value);
    updateUser({ engagement_pushes_enabled: value });
  };

  const openExport = () => {
    setExportPets(pets.map((p) => p.id)); // default: everyone
    setExportFormat('pdf');
    setExportOpen(true);
  };

  const toggleExportPet = (id) =>
    setExportPets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleExport = async () => {
    setExporting(true);
    try {
      // All pets selected → omit the filter so new records never miss out.
      const ids = exportPets.length === pets.length ? [] : exportPets;
      await exportRecords(exportFormat, ids);
      setExportOpen(false);
    } catch (err) {
      // Don't swallow the cause — a silent catch here is what made an Android
      // download failure hard to diagnose. Friendly toast, but log the real one.
      console.warn('Export failed', err);
      showToast('Export failed — nothing was lost, try again');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[type.screenTitle, styles.title]}>Profile</Text>

        <Card style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('AccountDetails')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </Card>

        <Text style={[type.sectionLabel, styles.sectionLabel]}>Notifications</Text>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="bell-outline"
            title="Care reminders"
            subtitle="Vaccines, meds, vet visits"
            right={
              <Switch
                value={careReminders}
                onValueChange={toggleCareReminders}
                trackColor={{ false: ui.track, true: ui.accent }}
                thumbColor="#ffffff"
                ios_backgroundColor={ui.track}
              />
            }
          />
          <ListRow
            icon="newspaper-variant-outline"
            title="Community digest"
            subtitle="Weekly highlights from your groups"
            right={
              <Switch
                value={communityDigest}
                onValueChange={toggleCommunityDigest}
                trackColor={{ false: ui.track, true: ui.accent }}
                thumbColor="#ffffff"
                ios_backgroundColor={ui.track}
              />
            }
          />
          <ListRow
            icon="cake-variant-outline"
            title="Celebrations & recaps"
            subtitle="Birthdays, gotcha days, weekly care recap"
            right={
              <Switch
                value={engagementPushes}
                onValueChange={toggleEngagementPushes}
                trackColor={{ false: ui.track, true: ui.accent }}
                thumbColor="#ffffff"
                ios_backgroundColor={ui.track}
              />
            }
            last
          />
        </Card>

        <Text style={[type.sectionLabel, styles.sectionLabel]}>Sharing & data</Text>
        <Card style={[styles.sectionCard, styles.dataCard]}>
          <ListRow
            icon="account-group-outline"
            title="Pet sharing & invites"
            right={
              invites.length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{invites.length}</Text>
                </View>
              ) : null
            }
            chevron
            onPress={() => navigation.navigate('Invites')}
          />
          <ListRow
            icon="download-outline"
            title="Export health records"
            subtitle="PDF or CSV · free forever"
            chevron
            onPress={openExport}
            last
          />
        </Card>
        <Text style={styles.dataCaption}>
          Your records belong to you — export everything free, anytime.
        </Text>

        {isAdmin && (
          <>
            <Text style={[type.sectionLabel, styles.sectionLabel]}>Moderation</Text>
            <Card style={styles.sectionCard}>
              <ListRow
                icon="shield-check-outline"
                title="Moderation"
                subtitle="Review reported posts"
                chevron
                onPress={() => navigation.navigate('Moderation')}
                last
              />
            </Card>
          </>
        )}

        <Text style={[type.sectionLabel, styles.sectionLabel]}>Support</Text>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="face-agent"
            title="Help & support"
            subtitle="Real humans — replies within 2 business days"
            chevron
            onPress={() => navigation.navigate('Support')}
            last
          />
        </Card>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { backgroundColor: ui.dangerPressTint }]}
          onPress={() => setConfirmLogout(true)}
        >
          <MaterialCommunityIcons name="logout" size={18} color={ui.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title="Export health records">
        {pets.length > 1 && (
          <View>
            <Text style={[type.sectionLabel, styles.sheetLabel]}>Pets</Text>
            <View style={styles.sheetChips}>
              {pets.map((pet) => (
                <Chip
                  key={pet.id}
                  label={pet.name}
                  active={exportPets.includes(pet.id)}
                  onPress={() => toggleExportPet(pet.id)}
                />
              ))}
            </View>
          </View>
        )}
        <View>
          <Text style={[type.sectionLabel, styles.sheetLabel]}>Format</Text>
          <View style={styles.sheetChips}>
            <Chip label="PDF" active={exportFormat === 'pdf'} onPress={() => setExportFormat('pdf')} />
            <Chip label="CSV" active={exportFormat === 'csv'} onPress={() => setExportFormat('csv')} />
          </View>
        </View>
        {/* Nothing to export with no pets. Pet chips only render with 2+ pets,
            so a selection is only required then; with one pet an empty
            selection already means "all pets". */}
        <Button
          label={exporting ? 'Exporting…' : exportFormat === 'pdf' ? 'Export PDF' : 'Export CSV'}
          onPress={handleExport}
          disabled={exporting || pets.length === 0 || (pets.length > 1 && exportPets.length === 0)}
        />
        <Text style={styles.sheetCaption}>
          Free forever — your records are never locked behind a plan.
        </Text>
      </Sheet>

      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        message="Your pets' records stay safe and synced."
        confirmLabel="Log out"
        destructive
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  title: { color: ui.ink, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    marginBottom: 22,
    padding: 18,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, color: ui.accent },
  userName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: ui.ink },
  userEmail: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    color: ui.sub,
    marginTop: 1,
  },
  editLink: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.accent },
  sectionLabel: { color: ui.subtle, marginHorizontal: 24, marginBottom: 8 },
  sectionCard: { marginHorizontal: 24, marginBottom: 22 },
  dataCard: { marginBottom: 8 },
  dataCaption: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: ui.subtle,
    marginHorizontal: 24,
    marginBottom: 22,
  },
  sheetLabel: { color: ui.subtle, marginBottom: 8 },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetCaption: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: ui.subtle,
    textAlign: 'center',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, color: ui.accent },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 28,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
    borderCurve: 'continuous',
  },
  logoutText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.danger },
});
