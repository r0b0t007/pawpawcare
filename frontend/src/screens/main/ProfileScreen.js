import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { usePetRecords } from '../../hooks/usePetRecords';
import { useInvitesQuery } from '../../hooks/useInvites';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { getPref, setPref } from '../../services/prefs';
import { exportRecords } from '../../services/exportRecords';
import { captureException, isSentryEnabled } from '../../services/sentry';
import { isAnalyticsEnabled, setAnalyticsEnabled } from '../../services/analytics';
import { usePlan } from '../../hooks/useSubscription';
import { useInFlight } from '../../hooks/useInFlight';
import { planStatus, planTitle } from '../../utils/subscription';
import { useTranslation, LANGUAGE_CHOICES, languageChoice, setLanguageChoice } from '../../i18n';
import { ui, type, motion } from '../../theme';
import { Card, ListRow, ConfirmDialog, Sheet, Chip, Button, PetFaceStack, Toggle, showToast, NotificationsBanner } from '../../components';

// The Profile tab ("Lively & Light"): a friendly account card that leads
// with who you are and who you care for (pet faces — recognition, not
// reading), then short grouped lists — notifications, sharing & data,
// privacy, support — and log out as a quiet danger row at the very end,
// behind a confirm. One accent, used only for actions and switches.
// Every string comes from i18n (src/i18n/*.json, `profile.*`); pet and
// account names are interpolated as entered, never translated.

const FACES = 4; // pet faces shown on the account card; the rest are "+N"

function SectionLabel({ children }) {
  return <Text style={[type.sectionLabel, styles.sectionLabel]}>{children}</Text>;
}

export default function ProfileScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const { user, isAdmin, logout, updateUser } = useAuth();
  const { rescheduleReminders, cancelReminderNotifications } = useData();
  const pets = usePetRecords();
  // The tab stays mounted: refresh the pending badge whenever it's shown.
  const { data: invites = [], refetch: refetchInvites } = useInvitesQuery();
  useRefetchOnFocus(refetchInvites);
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
  // from the current reminder list — both through DataContext's one scheduler,
  // so they happen in order (scheduling reads the pref, so persist first).
  const toggleCareReminders = async (value) => {
    setCareReminders(value);
    await setPref('careReminders', value);
    if (value) {
      rescheduleReminders();
    } else {
      cancelReminderNotifications();
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
      showToast(t('profile.privacy.saveFailed'));
    }
  };

  // Admin-only end-to-end check: the report should appear in Sentry
  // (pawpawcare-app) symbolicated, tagged with this build's update id.
  const sendTestErrorReport = () => {
    if (!isSentryEnabled()) {
      showToast(t('profile.admin.crashReportingOff'));
      return;
    }
    captureException(new Error('Test error report from the PawPawCare app'));
    showToast(t('profile.admin.testReportSent'));
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
        showToast(t('profile.export.failed'));
      }
    });

  // Language: applied at once (no restart) and kept on this device; the
  // account copy (server emails and pushes) is a fire-and-forget PATCH —
  // updateUser never throws, and the device setting stands either way.
  const [language, setLanguage] = useState(languageChoice);
  const [languageOpen, setLanguageOpen] = useState(false);
  // A change of the phone's language ends a fixed choice (i18n
  // noteDeviceLanguage) while this tab stays mounted: show the setting again.
  useEffect(() => setLanguage(languageChoice()), [i18n.language]);
  const chooseLanguage = async (next) => {
    setLanguageOpen(false);
    setLanguage(next);
    const shown = await setLanguageChoice(next);
    updateUser({ locale: shown });
  };

  const firstName = user?.name?.split(' ')[0];
  const careLine =
    pets.length === 0
      ? t('profile.careNone')
      : pets.length === 1
        ? t('profile.careOne', { name: pets[0].name })
        : t('profile.careMany', { count: pets.length });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">{t('profile.title')}</Text>

        {/* Account card — the screen's one elevated hero. */}
        <Card padded elevated style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {firstName ? t('profile.greeting', { name: firstName }) : user?.name}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1} selectable>{user?.email}</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('AccountDetails')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: motion.pressOpacity }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editA11y')}
            >
              <Text style={styles.editLink}>{t('profile.edit')}</Text>
            </Pressable>
          </View>
          <View style={styles.careRow}>
            <PetFaceStack pets={pets} max={FACES} />
            <Text style={styles.careLine} numberOfLines={1}>{careLine}</Text>
          </View>
        </Card>

        {(subscriptionsVisible || plan.active) && (
          <>
            <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
            <Card style={styles.sectionCard}>
              <ListRow
                icon="star-four-points-outline"
                title={planTitle(plan, included)}
                subtitle={planLine ? planLine.label : included ? t('profile.subscription.earlyMember') : t('profile.subscription.free')}
                chevron
                onPress={() => navigation.navigate('Subscription')}
                last
              />
            </Card>
          </>
        )}

        <SectionLabel>{t('profile.sections.notifications')}</SectionLabel>
        <NotificationsBanner style={styles.sectionCard} />
        <Card style={styles.sectionCard}>
          <ListRow
            icon="bell-outline"
            title={t('profile.notifications.careTitle')}
            subtitle={t('profile.notifications.careSubtitle')}
            right={<Toggle value={careReminders} onValueChange={toggleCareReminders} accessibilityLabel={t('profile.notifications.careTitle')} />}
          />
          <ListRow
            icon="newspaper-variant-outline"
            title={t('profile.notifications.digestTitle')}
            subtitle={t('profile.notifications.digestSubtitle')}
            right={<Toggle value={communityDigest} onValueChange={toggleCommunityDigest} accessibilityLabel={t('profile.notifications.digestTitle')} />}
          />
          <ListRow
            icon="cake-variant-outline"
            title={t('profile.notifications.celebrationsTitle')}
            subtitle={t('profile.notifications.celebrationsSubtitle')}
            right={<Toggle value={engagementPushes} onValueChange={toggleEngagementPushes} accessibilityLabel={t('profile.notifications.celebrationsA11y')} />}
            last
          />
        </Card>

        <SectionLabel>{t('profile.sections.sharing')}</SectionLabel>
        <Card style={[styles.sectionCard, styles.dataCard]}>
          <ListRow
            icon="account-group-outline"
            title={t('profile.sharing.invitesTitle')}
            subtitle={invites.length > 0 ? t('profile.sharing.invitesWaiting', { count: invites.length }) : t('profile.sharing.invitesSubtitle')}
            right={
              invites.length > 0 ? (
                <View style={styles.badge} accessibilityLabel={t('profile.sharing.invitesPendingA11y', { count: invites.length })}>
                  <Text style={styles.badgeText}>{invites.length}</Text>
                </View>
              ) : null
            }
            chevron
            onPress={() => navigation.navigate('Invites')}
          />
          <ListRow
            icon="download-outline"
            title={t('profile.sharing.exportTitle')}
            subtitle={t('profile.sharing.exportSubtitle')}
            chevron
            onPress={openExport}
            last
          />
        </Card>
        <Text style={styles.caption}>{t('profile.sharing.caption')}</Text>

        <SectionLabel>{t('profile.sections.privacy')}</SectionLabel>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="chart-box-outline"
            title={t('profile.privacy.analyticsTitle')}
            subtitle={t('profile.privacy.analyticsSubtitle')}
            right={
              <Toggle
                value={shareAnalytics}
                onValueChange={toggleShareAnalytics}
                disabled={savingAnalytics}
                accessibilityLabel={t('profile.privacy.analyticsTitle')}
              />
            }
            last
          />
        </Card>

        <SectionLabel>{t('profile.sections.language')}</SectionLabel>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="translate"
            title={t('profile.language.title')}
            value={t(`languages.${language}`)}
            chevron
            onPress={() => setLanguageOpen(true)}
            last
          />
        </Card>

        {isAdmin && (
          <>
            <SectionLabel>{t('profile.sections.admin')}</SectionLabel>
            <Card style={styles.sectionCard}>
              <ListRow
                icon="shield-check-outline"
                title={t('profile.admin.moderationTitle')}
                subtitle={t('profile.admin.moderationSubtitle')}
                chevron
                onPress={() => navigation.navigate('Moderation')}
              />
              <ListRow
                icon="bug-outline"
                title={t('profile.admin.testErrorTitle')}
                subtitle={t('profile.admin.testErrorSubtitle')}
                onPress={sendTestErrorReport}
                last
              />
            </Card>
          </>
        )}

        <SectionLabel>{t('profile.sections.support')}</SectionLabel>
        <Card style={styles.sectionCard}>
          {/* One entry for help and feedback (two rows led to the same
              screen). Private, open to everyone, and never tied to the store
              rating prompt (services/storeReview), per store policy. */}
          <ListRow
            icon="lifebuoy"
            title={t('profile.support.helpTitle')}
            subtitle={t('profile.support.helpSubtitle')}
            chevron
            onPress={() => navigation.navigate('Support')}
            last
          />
        </Card>

        {/* Log out: a quiet danger row at the end, behind a confirm. */}
        <Card style={styles.sectionCard}>
          <ListRow icon="logout" title={t('profile.logout.row')} danger onPress={() => setConfirmLogout(true)} last />
        </Card>
      </ScrollView>

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title={t('profile.export.sheetTitle')}>
        {pets.length > 1 && (
          <View>
            <Text style={[type.sectionLabel, styles.sheetLabel]}>{t('profile.export.pets')}</Text>
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
          <Text style={[type.sectionLabel, styles.sheetLabel]}>{t('profile.export.format')}</Text>
          <View style={styles.sheetChips}>
            <Chip accessibilityRole="radio" label={t('profile.export.pdf')} active={exportFormat === 'pdf'} onPress={() => setExportFormat('pdf')} />
            <Chip accessibilityRole="radio" label={t('profile.export.csv')} active={exportFormat === 'csv'} onPress={() => setExportFormat('csv')} />
          </View>
        </View>
        {/* Nothing to export with no pets. Pet chips only render with 2+ pets,
            so a selection is only required then; with one pet an empty
            selection already means "all pets". */}
        <Button
          label={exporting ? t('profile.export.exporting') : exportFormat === 'pdf' ? t('profile.export.exportPdf') : t('profile.export.exportCsv')}
          icon="download-outline"
          onPress={handleExport}
          disabled={exporting || pets.length === 0 || (pets.length > 1 && exportPets.length === 0)}
        />
        <Text style={styles.sheetCaption}>{t('profile.export.caption')}</Text>
      </Sheet>

      {/* One choice in a set: radio chips, like the export format. */}
      <Sheet visible={languageOpen} onClose={() => setLanguageOpen(false)} title={t('profile.language.sheetTitle')}>
        <View style={styles.sheetChips}>
          {LANGUAGE_CHOICES.map((choice) => (
            <Chip
              key={choice}
              accessibilityRole="radio"
              label={t(`languages.${choice}`)}
              active={language === choice}
              onPress={() => chooseLanguage(choice)}
            />
          ))}
        </View>
        <Text style={styles.languageCaption}>{t('profile.language.caption')}</Text>
      </Sheet>

      <ConfirmDialog
        visible={confirmLogout}
        title={t('profile.logout.confirmTitle')}
        message={t('profile.logout.confirmMessage')}
        confirmLabel={t('profile.logout.confirmLabel')}
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
  languageCaption: { ...type.secondary, color: ui.sub },
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
