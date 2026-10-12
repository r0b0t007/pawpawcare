import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getPref, setPref } from '../../services/prefs';
import { scheduleLocalReminders, cancelAllLocalReminders } from '../../services/notifications';
import { exportRecords } from '../../services/exportRecords';
import { captureException, isSentryEnabled } from '../../services/sentry';
import { isAnalyticsEnabled, setAnalyticsEnabled } from '../../services/analytics';
import { usePlan } from '../../hooks/useSubscription';
import { useInFlight } from '../../hooks/useInFlight';
import { planStatus, planTitle } from '../../utils/subscription';
import { ui, type, motion } from '../../theme';
import { Card, ListRow, ConfirmDialog, Sheet, Chip, Button, PetFaceStack, showToast } from '../../components';

// The Profile tab ("Lively & Light"): a friendly account card that leads
// with who you are and who you care for (pet faces — recognition, not
// reading), then short grouped lists — notifications, sharing & data,
// privacy, support — and log out as a quiet danger row at the very end,
// behind a confirm. One accent, used only for actions and switches.

const FACES = 4; // pet faces shown on the account card; the rest are "+N"

// Same switch look everywhere on this screen.
function Toggle(props) {
  return (
    <Switch
      trackColor={{ false: ui.track, true: ui.accent }}
      thumbColor={ui.onAccent}
      // react-native-web ignores thumbColor and paints its own teal default.
      activeThumbColor={ui.onAccent}
      ios_backgroundColor={ui.track}
      {...props}
    />
  );
}

function SectionLabel({ children }) {
  return <Text style={[type.sectionLabel, styles.sectionLabel]}>{children}</Text>;
}

export default function ProfileScreen({ navigation }) {
  const { user, isAdmin, logout, updateUser } = useAuth();
  const { invites, reminders, pets } = useData();
  // Subscription row: only once the server shows subscriptions to this
  // account (or it already has a plan) — invisible while the feature is dark.
  const { plan, included, visible: subscriptionsVisible } = usePlan();
  const planLine = planStatus(plan);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [careReminders, setCareReminders] = useState(true);
  const [communityDigest, setCommunityDigest] = useState(true);

  // Export center — sheet state lives here; the download/share plumbing is in
  // services/exportRecords.js. The export runs through useInFlight, so a
  // double tap never starts two downloads.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportPets, setExportPets] = useState([]);
  const { run, isBusy } = useInFlight();
  const exporting = isBusy('export');

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

  // Product analytics opt-out: applied on this device right away and saved on
  // the account (server value wins at the next sign-in, on any device).
  // Crash reports are separate and stay on — they carry no usage data.
  // The switch shows PostHog's real state; while a save is in flight it's
  // disabled (no racing PATCHes), and a failed save rolls the device back —
  // otherwise the stale server value would silently undo it at next launch.
  const [shareAnalytics, setShareAnalytics] = useState(isAnalyticsEnabled);
  const [savingAnalytics, setSavingAnalytics] = useState(false);
  const toggleShareAnalytics = async (value) => {
    const previous = shareAnalytics;
    setShareAnalytics(value);
    setSavingAnalytics(true);
    setAnalyticsEnabled(value);
    const saved = await updateUser({ analytics_opt_out: !value });
    setSavingAnalytics(false);
    if (!saved) {
      setShareAnalytics(previous);
      setAnalyticsEnabled(previous);
      showToast("Couldn't save your choice — try again");
    }
  };

  // Admin-only end-to-end check: the report should appear in Sentry
  // (pawpawcare-app) symbolicated, tagged with this build's update id.
  const sendTestErrorReport = () => {
    if (!isSentryEnabled()) {
      showToast('Crash reporting is off in this build');
      return;
    }
    captureException(new Error('Test error report from the PawPawCare app'));
    showToast('Test report sent');
  };

  const openExport = () => {
    setExportPets(pets.map((p) => p.id)); // default: everyone
    setExportFormat('pdf');
    setExportOpen(true);
  };

  const toggleExportPet = (id) =>
    setExportPets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleExport = () =>
    run('export', async () => {
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
      }
    });

  const firstName = user?.name?.split(' ')[0];
  const careLine =
    pets.length === 0
      ? 'Add a pet to get started'
      : pets.length === 1
        ? `Caring for ${pets[0].name}`
        : `Caring for ${pets.length} pets`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">Profile</Text>

        {/* Account card — the screen's one elevated hero. */}
        <Card padded elevated style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {firstName ? `Hi, ${firstName}` : user?.name}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1} selectable>{user?.email}</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('AccountDetails')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: motion.pressOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Edit account details"
            >
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.careRow}>
            <PetFaceStack pets={pets} max={FACES} />
            <Text style={styles.careLine} numberOfLines={1}>{careLine}</Text>
          </View>
        </Card>

        {(subscriptionsVisible || plan.active) && (
          <>
            <SectionLabel>Subscription</SectionLabel>
            <Card style={styles.sectionCard}>
              <ListRow
                icon="star-four-points-outline"
                title={planTitle(plan, included)}
                subtitle={planLine ? planLine.label : included ? 'Thanks for being an early member' : 'Records and exports free forever'}
                chevron
                onPress={() => navigation.navigate('Subscription')}
                last
              />
            </Card>
          </>
        )}

        <SectionLabel>Notifications</SectionLabel>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="bell-outline"
            title="Care reminders"
            subtitle="Vaccines, meds, vet visits"
            right={<Toggle value={careReminders} onValueChange={toggleCareReminders} accessibilityLabel="Care reminders" />}
          />
          <ListRow
            icon="newspaper-variant-outline"
            title="Community digest"
            subtitle="Weekly highlights from your groups"
            right={<Toggle value={communityDigest} onValueChange={toggleCommunityDigest} accessibilityLabel="Community digest" />}
          />
          <ListRow
            icon="cake-variant-outline"
            title="Celebrations & recaps"
            subtitle="Birthdays, gotcha days, weekly care recap"
            right={<Toggle value={engagementPushes} onValueChange={toggleEngagementPushes} accessibilityLabel="Celebrations and recaps" />}
            last
          />
        </Card>

        <SectionLabel>Sharing & data</SectionLabel>
        <Card style={[styles.sectionCard, styles.dataCard]}>
          <ListRow
            icon="account-group-outline"
            title="Pet sharing & invites"
            subtitle={invites.length > 0 ? `${invites.length} waiting for you` : 'Family, sitters and co-owners'}
            right={
              invites.length > 0 ? (
                <View style={styles.badge} accessibilityLabel={`${invites.length} pending invites`}>
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
        <Text style={styles.caption}>
          Your records belong to you — export everything, anytime.
        </Text>

        <SectionLabel>Privacy</SectionLabel>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="chart-box-outline"
            title="Share usage analytics"
            subtitle="Which features you use — never pet records or health data"
            right={
              <Toggle
                value={shareAnalytics}
                onValueChange={toggleShareAnalytics}
                disabled={savingAnalytics}
                accessibilityLabel="Share usage analytics"
              />
            }
            last
          />
        </Card>

        {isAdmin && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <Card style={styles.sectionCard}>
              <ListRow
                icon="shield-check-outline"
                title="Moderation"
                subtitle="Review reported posts"
                chevron
                onPress={() => navigation.navigate('Moderation')}
              />
              <ListRow
                icon="bug-outline"
                title="Send test error report"
                subtitle="Checks crash reporting end to end"
                onPress={sendTestErrorReport}
                last
              />
            </Card>
          </>
        )}

        <SectionLabel>Support</SectionLabel>
        <Card style={styles.sectionCard}>
          {/* Private feedback, open to everyone — never tied to the store
              rating prompt (services/storeReview), per store policy. */}
          <ListRow
            icon="message-text-outline"
            title="Send feedback"
            subtitle="Tell us what to improve — only our team reads it"
            chevron
            onPress={() => navigation.navigate('Support', { category: 'feedback' })}
          />
          <ListRow
            icon="face-agent"
            title="Help & support"
            subtitle="Real humans — replies within 2 business days"
            chevron
            onPress={() => navigation.navigate('Support')}
            last
          />
        </Card>

        {/* Log out: a quiet danger row at the end, behind a confirm. */}
        <Card style={styles.sectionCard}>
          <ListRow icon="logout" title="Log out" danger onPress={() => setConfirmLogout(true)} last />
        </Card>
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
            <Chip accessibilityRole="radio" label="PDF" active={exportFormat === 'pdf'} onPress={() => setExportFormat('pdf')} />
            <Chip accessibilityRole="radio" label="CSV" active={exportFormat === 'csv'} onPress={() => setExportFormat('csv')} />
          </View>
        </View>
        {/* Nothing to export with no pets. Pet chips only render with 2+ pets,
            so a selection is only required then; with one pet an empty
            selection already means "all pets". */}
        <Button
          label={exporting ? 'Exporting…' : exportFormat === 'pdf' ? 'Export PDF' : 'Export CSV'}
          icon="download-outline"
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
  scroll: { paddingBottom: 36 },
  title: { color: ui.ink, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16 },
  userCard: { marginHorizontal: 20, marginBottom: 26, padding: 18, gap: 14 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 24, color: ui.accent },
  userName: { ...type.cardTitle, color: ui.ink },
  userEmail: { ...type.secondary, color: ui.sub, marginTop: 1 },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
  },
  editLink: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  careRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: ui.hairline,
  },
  careLine: { ...type.secondary, color: ui.sub, flex: 1 },
  sectionLabel: { color: ui.subtle, marginHorizontal: 24, marginBottom: 8 },
  sectionCard: { marginHorizontal: 20, marginBottom: 24 },
  dataCard: { marginBottom: 8 },
  caption: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11.5,
    color: ui.subtle,
    marginHorizontal: 24,
    marginBottom: 24,
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
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, color: ui.accent },
});
