import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { usePetRecords } from '../../hooks/usePets';
import { pickRecordImage } from '../../services/imagePicker';
import { track } from '../../services/analytics';
import { appliedToastText, buildExtractionPayload, extractionCount } from '../../utils/extraction';
import { fmtClock, fmtDay, fmtFull, relativeDay } from '../../utils/dates';
import i18n, { useLocale, useTranslation } from '../../i18n';
import { petById, emptyPhotoFor } from '../../utils/pets';
import { formatDecimal } from '../../utils/numbers';
import { useInFlight } from '../../hooks/useInFlight';
import { useVaultQuery } from '../../hooks/useVault';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { ui, type, radii, motion, photos, vaultColors } from '../../theme';
import {
  Card, Chip, Button, Sheet, ConfirmDialog, DeleteButton, EmptyState, PetFace, Skeleton, showToast, ScreenHeader, TextField,
} from '../../components';

// The medical vault ("Lively & Light"): the pet's face and a one-line summary
// up top, then one sky hero card with the single primary action (upload a
// record — the thing people come here to do) and the next vet visit. Below,
// three calm sections — documents, appointments, clinics — each showing its
// first few rows with the rest one tap away (progressive disclosure). Deletes
// stay behind ConfirmDialog and only confirm what the server actually removed.

const VAULT = vaultColors; // shared with the Health hub's vault card
const PREVIEW_ROWS = 3;

// `label` is a getter so it reads the app language at render time.
const category = (id, icon) => ({ id, icon, get label() { return i18n.t(`records.categories.${id}`); } });
const DOC_CATEGORIES = [
  category('lab', 'test-tube'),
  category('vaccination', 'needle'),
  category('prescription', 'pill'),
  category('invoice', 'receipt'),
  category('imaging', 'radiology-box-outline'),
  category('insurance', 'shield-check'),
  category('other', 'file-document-outline'),
];
const docMeta = (id) => DOC_CATEGORIES.find((c) => c.id === id) || DOC_CATEGORIES[DOC_CATEGORIES.length - 1];

const APPT_STATUS = ['scheduled', 'completed', 'cancelled'];
// Status shown once, as icon + word (never colour alone).
const APPT_STATUS_STYLE = {
  scheduled: { bg: VAULT.bg, fg: VAULT.fg, icon: 'calendar-clock' },
  completed: { bg: ui.successTint, fg: ui.success, icon: 'check-circle' },
  cancelled: { bg: ui.track, fg: ui.sub, icon: 'close-circle-outline' },
};
const apptStyle = (s) => APPT_STATUS_STYLE[s] || APPT_STATUS_STYLE.scheduled;

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// 'Scheduled' / 'Completed' / 'Cancelled' (a newer server value reads as-is).
const apptStatusLabel = (s) => (s ? i18n.t(`records.apptStatus.${s}`, { defaultValue: cap(s) }) : s);

// "Fri 10 Oct · 9:30 AM" — plain-language day plus time, never an ISO date.
const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${fmtDay(d)} · ${fmtClock(d)}`;
};
const fmtStamp = (iso) => (iso ? fmtFull(new Date(iso)) : '');
const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return i18n.t('records.size.bytes', { n: bytes });
  if (bytes < 1024 * 1024) return i18n.t('records.size.kb', { n: Math.round(bytes / 1024) });
  return i18n.t('records.size.mb', { n: formatDecimal(bytes / 1048576, 1) });
};

export default function MedicalRecordsScreen({ navigation, route }) {
  // Re-render dates and times when the app language changes: this screen
  // can stay mounted under another tab while the language is switched.
  useLocale();
  const { t } = useTranslation();
  const { petId, petName } = route.params;
  const {
    addClinic, deleteClinic,
    addAppointment, deleteAppointment, addDocument, deleteDocument, getDocumentUrl,
    extractDocument, applyExtraction,
  } = useData();
  const pets = usePetRecords();
  const pet = petById(pets, petId);
  const name = pet?.name || petName;

  const {
    data: records, isError, isFetching, isStale, errorUpdatedAt, refetch,
  } = useVaultQuery(petId);
  // Records can change from another phone sharing the pet: the vault re-reads
  // whenever the screen opens, and on focus once it is stale (the screen can
  // stay mounted under a tab).
  useRefetchOnFocus(refetch, { isStale });
  // A failed first load says so and offers a retry instead of leaving the
  // loading placeholders up forever; while that retry runs, the placeholders
  // come back so the tap visibly does something. Only read without records:
  // a failed re-read over records already shown keeps them.
  const loadFailed = isError && !isFetching;
  const [refreshing, setRefreshing] = useState(false);
  const [clinicModal, setClinicModal] = useState(false);
  const [apptModal, setApptModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // AI reads are paid: one at a time, and a double tap never starts two.
  const { run: runExtract, isBusy: isExtractBusy } = useInFlight();

  // Any failed re-read over records already shown — on opening, on focus or
  // a pull — keeps them and says so, instead of passing old (or no longer
  // shared) records off as current.
  const shownRef = useRef(records);
  shownRef.current = records;
  useEffect(() => {
    if (errorUpdatedAt && shownRef.current) showToast(i18n.t('records.toast.refreshFailed'));
  }, [errorUpdatedAt]);

  // One refresh at a time (pull or "Try again").
  const refreshBusy = useRef(false);
  const onRefresh = useCallback(async () => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshing(true);
    await refetch();
    refreshBusy.current = false;
    setRefreshing(false);
  }, [refetch]);

  const clinics = records?.clinics || [];
  const appointments = records?.appointments || [];
  const documents = records?.documents || [];
  const isEmpty = !!records && !clinics.length && !appointments.length && !documents.length;

  // The next scheduled visit, surfaced in the hero so it's never buried.
  const nextVisit = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.status === 'scheduled' && new Date(a.scheduledAt).getTime() >= now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
  }, [appointments]);

  const summary = [
    documents.length && t('records.summary.documents', { count: documents.length }),
    appointments.length && t('records.summary.visits', { count: appointments.length }),
    clinics.length && t('records.summary.clinics', { count: clinics.length }),
  ].filter(Boolean).join(' · ');

  const openDocument = async (doc) => {
    // Files live on a private disk — fetch a short-lived signed URL to view.
    const url = await getDocumentUrl(petId, doc.id);
    if (!url) { showToast(t('records.toast.openFailed')); return; }
    Linking.openURL(url).catch(() => showToast(t('records.toast.openFailed')));
  };

  // Deletes resolve true/false (DataContext contract): only a removal the
  // server confirmed says so, and DataContext takes only that row out of the
  // vault (no refetch of the whole vault); a failure keeps the row.
  // `kind` is 'document' | 'appointment' | 'clinic' (records.delete.<kind>).
  const confirmDelete = (kind, remove) =>
    setConfirm({
      title: t(`records.delete.${kind}.title`),
      message: t(`records.delete.${kind}.message`, { name: name || t('records.thisPet') }),
      confirmLabel: t('records.delete.confirm'),
      destructive: true,
      action: async () => {
        if (await remove()) {
          showToast(t(`records.delete.${kind}.removed`));
        } else {
          showToast(t(`records.delete.${kind}.failed`));
        }
      },
    });

  // AI intake: extract once (the backend caches a completed extraction),
  // then open the review sheet. Re-opening a reviewed document is free.
  const startExtraction = (doc) => {
    if (doc.extractionStatus === 'done' && doc.extraction) { setReviewDoc(doc); return undefined; }
    if (isExtractBusy('extract')) {
      showToast(t('records.toast.stillReading'));
      return undefined;
    }
    return runExtract('extract', async () => {
      setExtractingId(doc.id);
      try {
        const updated = await extractDocument(petId, doc.id);
        setReviewDoc(updated);
      } catch (e) {
        showToast(e.message || t('records.toast.readFailed'));
      } finally {
        setExtractingId(null);
      }
    });
  };

  const onApplied = (result) => {
    setReviewDoc(null);
    showToast(appliedToastText(result, t));
  };

  const renderDocument = (d, last) => {
    const m = docMeta(d.category);
    const applied = !!d.extraction?._applied_at;
    return (
      <Pressable
        key={d.id}
        style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: ui.pressTint }]}
        onPress={() => openDocument(d)}
        accessibilityRole="button"
        accessibilityLabel={`${d.title}. ${[m.label, fmtStamp(d.createdAt)].filter(Boolean).join(', ')}`}
        accessibilityHint={t('records.doc.openHint')}
        // One element for screen readers, so the Read and Delete buttons
        // inside can't be focused on their own — expose them as actions.
        accessibilityActions={[
          { name: 'activate', label: t('records.doc.open') },
          { name: 'read', label: applied ? t('records.doc.review') : t('records.doc.readWithAi') },
          { name: 'delete', label: t('records.delete.confirm') },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') openDocument(d);
          else if (nativeEvent.actionName === 'read') startExtraction(d);
          else if (nativeEvent.actionName === 'delete') confirmDelete('document', () => deleteDocument(petId, d.id));
        }}
      >
        <View style={styles.rowIcon}>
          <MaterialCommunityIcons name={d.mime === 'application/pdf' ? 'file-pdf-box' : m.icon} size={18} color={VAULT.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{d.title}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {[m.label, fmtSize(d.sizeBytes), fmtStamp(d.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {extractingId === d.id ? (
          <ActivityIndicator size="small" color={ui.accent} style={styles.rowAction} />
        ) : applied ? (
          <Pressable
            onPress={() => startExtraction(d)}
            hitSlop={hit}
            style={styles.rowAction}
            accessibilityRole="button"
            accessibilityLabel={t('records.doc.reviewA11y', { title: d.title })}
          >
            <MaterialCommunityIcons name="check-decagram" size={20} color={ui.success} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => startExtraction(d)}
            hitSlop={hit}
            style={({ pressed }) => [styles.readPill, pressed && { opacity: motion.pressOpacitySoft }]}
            accessibilityRole="button"
            accessibilityLabel={t('records.doc.readA11y', { title: d.title })}
          >
            <MaterialCommunityIcons name="creation" size={14} color={ui.accent} />
            <Text style={styles.readPillText}>{t('records.doc.read')}</Text>
          </Pressable>
        )}
        <DeleteButton label={t('records.deleteA11y', { name: d.title })} onPress={() => confirmDelete('document', () => deleteDocument(petId, d.id))} />
      </Pressable>
    );
  };

  const renderAppointment = (a, last) => {
    const s = apptStyle(a.status);
    return (
      <View key={a.id} style={[styles.row, !last && styles.rowDivider]}>
        <View style={styles.rowIcon}>
          <MaterialCommunityIcons name="calendar-clock" size={18} color={VAULT.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {fmtWhen(a.scheduledAt)}{a.clinicName ? ` · ${a.clinicName}` : ''}
          </Text>
        </View>
        <View style={[styles.statusTag, { backgroundColor: s.bg }]} accessible accessibilityLabel={apptStatusLabel(a.status)}>
          <MaterialCommunityIcons name={s.icon} size={12} color={s.fg} />
          <Text style={[styles.statusText, { color: s.fg }]}>{apptStatusLabel(a.status)}</Text>
        </View>
        <DeleteButton label={t('records.deleteA11y', { name: a.title })} onPress={() => confirmDelete('appointment', () => deleteAppointment(petId, a.id))} />
      </View>
    );
  };

  const renderClinic = (c, last) => (
    <View key={c.id} style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name="hospital-building" size={18} color={VAULT.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{c.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[c.vetName, c.phone].filter(Boolean).join(' · ') || c.email || c.address || t('records.clinic.fallback')}
        </Text>
      </View>
      {!!c.phone && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${c.phone}`)}
          hitSlop={hit}
          style={styles.callBtn}
          accessibilityRole="button"
          accessibilityLabel={t('records.clinic.callA11y', { name: c.name })}
        >
          <MaterialCommunityIcons name="phone" size={17} color={ui.accent} />
        </Pressable>
      )}
      <DeleteButton label={t('records.deleteA11y', { name: c.name })} onPress={() => confirmDelete('clinic', () => deleteClinic(petId, c.id))} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={name ? t('records.titlePet', { name }) : t('records.title')}
        subtitle={!records
          ? (loadFailed ? t('records.openFailed') : t('records.opening'))
          : summary || t('records.subtitle')}
        onBack={() => navigation.goBack()}
        avatar={pet ? <PetFace pet={pet} size={44} /> : null}
        style={styles.header}
      />

      {!records && loadFailed ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
        >
          <EmptyState
            photo={emptyPhotoFor(pet, photos.emptyBlanket)}
            title={t('records.loadFailed.title')}
            body={t('records.loadFailed.body')}
            actionLabel={t('records.loadFailed.action')}
            actionIcon="refresh"
            onAction={onRefresh}
          />
        </ScrollView>
      ) : !records ? (
        // Placeholders where the cards land — no spinner-only screen.
        <View style={styles.loading} accessibilityLabel={t('records.loadingA11y')}>
          <Skeleton width="100%" height={150} radius={20} />
          <Skeleton width={120} height={11} style={{ marginTop: 24 }} />
          <Skeleton width="100%" height={64} radius={16} style={{ marginTop: 10 }} />
          <Skeleton width="100%" height={64} radius={16} style={{ marginTop: 10 }} />
        </View>
      ) : isEmpty ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
        >
          <EmptyState
            photo={emptyPhotoFor(pet, photos.emptyBlanket)}
            title={name ? t('records.empty.titlePet', { name }) : t('records.empty.title')}
            body={t('records.empty.body')}
            actionLabel={t('records.upload')}
            actionIcon="camera-plus-outline"
            onAction={() => setDocModal(true)}
          />
          <View style={styles.quietLinks}>
            <QuietLink icon="hospital-building" label={t('records.addClinic')} onPress={() => setClinicModal(true)} />
            <QuietLink icon="calendar-clock" label={t('records.logVisit')} onPress={() => setApptModal(true)} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
        >
          {/* The one elevated hero: what this place is for, the next visit,
              and the single primary action. */}
          <Card padded elevated style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="shield-check" size={22} color={VAULT.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{t('records.hero.title')}</Text>
                <Text style={styles.heroSub}>
                  {nextVisit
                    ? t('records.hero.nextVisit', { when: relativeDay(new Date(nextVisit.scheduledAt)), title: nextVisit.title })
                    : t('records.hero.private')}
                </Text>
              </View>
            </View>
            <Button label={t('records.upload')} icon="camera-plus-outline" onPress={() => setDocModal(true)} />
          </Card>

          <Section
            title={t('records.sections.documents')}
            items={documents}
            renderItem={renderDocument}
            empty={<QuietLink icon="folder-multiple-outline" label={t('records.uploadPhoto')} onPress={() => setDocModal(true)} />}
          />
          <Section
            title={t('records.sections.visits')}
            onAdd={() => setApptModal(true)}
            addLabel={t('records.logVisit')}
            items={appointments}
            renderItem={renderAppointment}
            empty={<QuietLink icon="calendar-clock" label={t('records.logVisit')} onPress={() => setApptModal(true)} />}
          />
          <Section
            title={t('records.sections.clinics')}
            onAdd={() => setClinicModal(true)}
            addLabel={t('records.addClinic')}
            items={clinics}
            renderItem={renderClinic}
            empty={<QuietLink icon="hospital-building" label={t('records.addPetClinic', { name: name || t('records.yourPet') })} onPress={() => setClinicModal(true)} />}
          />
        </ScrollView>
      )}

      <ClinicModal
        visible={clinicModal}
        onClose={() => setClinicModal(false)}
        onSave={(data) => addClinic(petId, data)}
      />
      <AppointmentModal
        visible={apptModal}
        clinics={clinics}
        onClose={() => setApptModal(false)}
        onSave={(data) => addAppointment(petId, data)}
      />
      <DocumentModal
        visible={docModal}
        onClose={() => setDocModal(false)}
        onSave={(file, fields) => addDocument(petId, file, fields)}
      />
      <ExtractionSheet
        visible={!!reviewDoc}
        doc={reviewDoc}
        petName={name}
        onClose={() => setReviewDoc(null)}
        onApply={(payload) => applyExtraction(petId, reviewDoc.id, payload)}
        onDone={onApplied}
      />

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const a = confirm?.action; setConfirm(null); a?.(); }}
      />
    </SafeAreaView>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

// A section shows its first PREVIEW_ROWS rows; the rest are one tap away.
function Section({ title, onAdd, addLabel, items, renderItem, empty }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PREVIEW_ROWS);
  const hidden = items.length - PREVIEW_ROWS;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[type.sectionLabel, { color: ui.subtle }]}>{title}</Text>
        {onAdd ? (
          <Pressable
            onPress={onAdd}
            hitSlop={hit}
            style={({ pressed }) => [styles.addLink, pressed && { opacity: motion.pressOpacity }]}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
          >
            <MaterialCommunityIcons name="plus" size={14} color={ui.accent} />
            <Text style={styles.addLinkText}>{t('records.add')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Card>
        {items.length === 0
          ? empty
          : shown.map((item, i) => renderItem(item, i === shown.length - 1))}
        {hidden > 0 && (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={({ pressed }) => [styles.moreRow, pressed && { backgroundColor: ui.pressTint }]}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <Text style={styles.moreText}>{expanded ? t('records.showLess') : t('records.showMore', { count: hidden })}</Text>
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={ui.accent} />
          </Pressable>
        )}
      </Card>
    </View>
  );
}

function QuietLink({ icon, label, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quiet, pressed && { backgroundColor: ui.pressTint }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name={icon} size={20} color={ui.faint} />
      <Text style={styles.quietText}>{label}</Text>
      <MaterialCommunityIcons name="plus" size={16} color={ui.accent} />
    </Pressable>
  );
}

// Shared form scaffold on top of the design-system Sheet: scrollable body,
// inline error, Cancel/Save footer.
function FormSheet({ visible, title, onClose, onSave, busy, saveLabel, busyLabel, error, saveDisabled, children }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} style={{ maxHeight: '88%' }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
        {!!error && <Text style={styles.error} selectable>{error}</Text>}
      </ScrollView>
      <View style={styles.sheetActions}>
        <Button variant="soft" label={t('records.form.cancel')} onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={busy ? busyLabel ?? t('records.form.saving') : saveLabel}
          onPress={onSave}
          disabled={busy || saveDisabled}
          style={{ flex: 1 }}
        />
      </View>
    </Sheet>
  );
}

// The vault's add/update calls THROW by design (the forms show the API's
// validation message). Each save runs through useInFlight so a double tap
// never creates the record twice.
function ClinicModal({ visible, onClose, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', vet_name: '', phone: '', email: '', address: '', notes: '' });
  const [error, setError] = useState(null);
  const { run, isBusy } = useInFlight();
  const busy = isBusy('save');

  const reset = () => { setForm({ name: '', vet_name: '', phone: '', email: '', address: '', notes: '' }); setError(null); };
  const close = () => { reset(); onClose(); };

  const save = () => {
    if (!form.name.trim()) return undefined;
    return run('save', async () => {
      setError(null);
      try {
        await onSave({
          name: form.name.trim(),
          vet_name: form.vet_name.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        });
        reset(); onClose();
        showToast(t('records.clinic.added'));
      } catch (e) { setError(e.message || t('records.clinic.saveFailed')); }
    });
  };

  const field = (key, label, opts = {}) => (
    <TextField
      label={label}
      style={{ marginTop: 12 }}
      value={form[key]}
      onChangeText={(v) => { setForm({ ...form, [key]: v }); setError(null); }}
      {...opts}
    />
  );

  return (
    <FormSheet visible={visible} title={t('records.clinic.sheetTitle')} onClose={close} onSave={save} busy={busy} saveLabel={t('records.clinic.save')} error={error} saveDisabled={!form.name.trim()}>
      <TextField
        label={t('records.clinic.name')}
        placeholder={t('records.clinic.namePlaceholder')}
        value={form.name}
        onChangeText={(v) => { setForm({ ...form, name: v }); setError(null); }}
        autoFocus
      />
      {field('vet_name', t('records.clinic.vetName'))}
      {field('phone', t('records.clinic.phone'), { keyboardType: 'phone-pad' })}
      {field('email', t('records.clinic.email'), { keyboardType: 'email-address', autoCapitalize: 'none' })}
      {field('address', t('records.clinic.address'))}
    </FormSheet>
  );
}

function AppointmentModal({ visible, clinics, onClose, onSave }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(new Date());
  const [clinicId, setClinicId] = useState(null);
  const [status, setStatus] = useState('scheduled');
  const [notes, setNotes] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [error, setError] = useState(null);
  const { run, isBusy } = useInFlight();
  const busy = isBusy('save');

  const reset = () => { setTitle(''); setWhen(new Date()); setClinicId(null); setStatus('scheduled'); setNotes(''); setError(null); };
  const close = () => { reset(); onClose(); };

  const save = () => {
    if (!title.trim()) return undefined;
    return run('save', async () => {
      setError(null);
      try {
        await onSave({
          title: title.trim(),
          scheduled_at: when.toISOString(),
          clinic_id: clinicId,
          status,
          notes: notes.trim() || null,
        });
        reset(); onClose();
        showToast(t('records.visit.logged'), { celebrate: true, actionType: 'appointment_logged' });
      } catch (e) { setError(e.message || t('records.visit.saveFailed')); }
    });
  };

  return (
    <FormSheet visible={visible} title={t('records.logVisit')} onClose={close} onSave={save} busy={busy} saveLabel={t('records.visit.save')} error={error} saveDisabled={!title.trim()}>
      <TextField
        label={t('records.visit.reason')}
        placeholder={t('records.visit.reasonPlaceholder')}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        autoFocus
        accessibilityLabel={t('records.visit.reasonA11y')}
      />
      <Pressable
        style={({ pressed }) => [styles.pickerBtn, pressed && { backgroundColor: ui.pressTint }]}
        onPress={() => setShowDate(true)}
        accessibilityRole="button"
        accessibilityLabel={t('records.visit.whenA11y', { when: fmtWhen(when.toISOString()) })}
      >
        <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={ui.accent} />
        <Text style={styles.pickerText}>{fmtWhen(when.toISOString())}</Text>
        <MaterialCommunityIcons name="pencil-outline" size={14} color={ui.faint} />
      </Pressable>

      {clinics.length > 0 && (
        <>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('records.visit.clinic')}</Text>
          <View style={styles.chipWrap}>
            {clinics.map((c) => (
              <Chip accessibilityRole="radio" key={c.id} label={c.name} active={clinicId === c.id} onPress={() => setClinicId(clinicId === c.id ? null : c.id)} />
            ))}
          </View>
        </>
      )}

      <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('records.visit.status')}</Text>
      <View style={styles.chipWrap}>
        {APPT_STATUS.map((s) => (
          <Chip accessibilityRole="radio" key={s} label={apptStatusLabel(s)} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>

      {showDate && (
        <DateTimePicker
          value={when}
          mode="date"
          onChange={(e, d) => {
            setShowDate(false);
            if (e.type === 'set' && d) {
              const nd = new Date(when);
              nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
              setWhen(nd);
              setShowTime(true);
            }
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={when}
          mode="time"
          onChange={(e, d) => {
            setShowTime(false);
            if (e.type === 'set' && d) {
              const nd = new Date(when);
              nd.setHours(d.getHours(), d.getMinutes(), 0, 0);
              setWhen(nd);
            }
          }}
        />
      )}
    </FormSheet>
  );
}

function DocumentModal({ visible, onClose, onSave }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('lab');
  const [error, setError] = useState(null);
  const { run, isBusy } = useInFlight();
  const busy = isBusy('save');
  // The previous upload attempt failed. The whole form state (title, category,
  // picked file) is kept — the primary button becomes "Retry upload" and a
  // banner says so explicitly. Nothing fails silently in the vault.
  const [failed, setFailed] = useState(false);

  const reset = () => { setFile(null); setTitle(''); setCategory('lab'); setError(null); setFailed(false); };
  const close = () => { reset(); onClose(); };

  const pick = async () => {
    setError(null);
    const res = await pickRecordImage();
    if (res.error) { setError(res.error === 'permission' ? t('records.doc.permission') : t('records.doc.pickFailed')); return; }
    if (res.canceled) return;
    setFile(res);
    setFailed(false); // a new file is a fresh attempt, not a retry
    if (!title) setTitle(t('records.doc.defaultTitle', { category: docMeta(category).label }));
  };

  const save = () => {
    if (!file || !title.trim()) return undefined;
    return run('save', async () => {
      if (failed) track('document_upload_retried');
      setError(null);
      try {
        await onSave(file, { title: title.trim(), category });
        reset(); onClose();
        showToast(t('records.doc.uploaded'));
      } catch (e) {
        // Keep the ENTIRE form + picked file; the banner + retry button take
        // over from here.
        setFailed(true);
        track('document_upload_failed');
      }
    });
  };

  return (
    <FormSheet
      visible={visible}
      title={t('records.upload')}
      onClose={close}
      onSave={save}
      busy={busy}
      saveLabel={failed ? t('records.doc.retry') : t('records.doc.uploadAction')}
      busyLabel={t('records.doc.uploading')}
      error={error}
      saveDisabled={!file || !title.trim()}
    >
      {failed && !busy && (
        <Banner icon="alert-circle-outline" tone="danger" text={t('records.doc.uploadFailed')} />
      )}
      <Pressable
        style={({ pressed }) => [styles.fileBtn, file && styles.fileBtnPicked, pressed && { backgroundColor: ui.pressTint }]}
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={file ? t('records.doc.chosenA11y', { name: file.name }) : t('records.doc.choose')}
      >
        <MaterialCommunityIcons name={file ? 'check-circle' : 'image-plus'} size={22} color={file ? ui.success : ui.accent} />
        <Text style={styles.fileBtnText} numberOfLines={1}>{file ? file.name : t('records.doc.choose')}</Text>
      </Pressable>
      <TextField
        label={t('records.doc.title')}
        style={{ marginTop: 12 }}
        placeholder={t('records.doc.titlePlaceholder')}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        accessibilityLabel={t('records.doc.titleA11y')}
      />
      <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('records.doc.category')}</Text>
      <View style={styles.chipWrap}>
        {DOC_CATEGORIES.map((c) => (
          <Chip accessibilityRole="radio" key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </View>
    </FormSheet>
  );
}

// ── AI extraction review ───────────────────────────────────────────────────────
// Shows the AI's suggestions from a document. Every item is opt-out-able and
// editable inline; nothing is saved until the user taps Apply. Dates are typed
// as YYYY-MM-DD strings — anything else is sent as null (fill in later).

function ExtractionSheet({ visible, doc, petName, onClose, onApply, onDone }) {
  const { t } = useTranslation();
  const ex = doc?.extraction;
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);
  const { run, isBusy } = useInFlight();
  const busy = isBusy('apply');

  // Build an editable working copy whenever a (new) document is opened.
  useEffect(() => {
    if (!visible || !ex) return;
    setSel({
      vaccinations: (ex.vaccinations || []).map((v) => ({
        included: true, name: v.name || '',
        administered: v.administered_date || '', due: v.due_date || '', notes: v.notes || '',
      })),
      medications: (ex.medications || []).map((m) => ({
        included: true, name: m.name || '', dosage: m.dosage || '',
        frequency: m.frequency || null, start: m.start_date || '', end: m.end_date || '', notes: m.notes || '',
      })),
      weight: ex.weight
        ? { included: true, value: formatDecimal(ex.weight.value, { min: 0, max: 10 }), unit: ex.weight.unit || 'kg', date: ex.weight.date || '' }
        : null,
      // Costs are opt-in — not everyone tracks expenses.
      expense: ex.total_cost
        ? { included: false, amount: formatDecimal(ex.total_cost, { min: 0, max: 10 }), date: ex.document_date || '' }
        : null,
      clinic: ex.clinic?.name
        ? { included: true, name: ex.clinic.name, phone: ex.clinic.phone || '' }
        : null,
      setTitle: !!ex.suggested_title,
      setCategory: !!ex.document_type && ex.document_type !== 'other',
    });
    setError(null);
  }, [visible, doc?.id]);

  if (!visible || !ex || !sel) return null;

  const setVax = (i, patch) =>
    setSel({ ...sel, vaccinations: sel.vaccinations.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const setMed = (i, patch) =>
    setSel({ ...sel, medications: sel.medications.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const count = extractionCount(sel);

  const nothingFound =
    !sel.vaccinations.length && !sel.medications.length && !sel.weight && !sel.expense && !sel.clinic;

  const apply = () =>
    run('apply', async () => {
      setError(null);
      try {
        const result = await onApply(buildExtractionPayload(sel));
        onDone(result);
      } catch (e) { setError(e.message || t('records.extract.applyFailed')); }
    });

  return (
    <FormSheet
      visible={visible}
      title={t('records.extract.title')}
      onClose={onClose}
      onSave={apply}
      busy={busy}
      saveLabel={count > 0 ? t('records.extract.applyCount', { count }) : t('records.extract.apply')}
      saveDisabled={count === 0 && !sel.setTitle && !sel.setCategory}
      error={error}
    >
      {ex.matches_pet === false && (
        <Banner icon="alert" tone="danger" text={t('records.extract.otherPet', { name: petName || t('records.extract.thisOne') })} />
      )}
      {!!ex.notes_for_owner && <Banner icon="information" tone="info" text={ex.notes_for_owner} />}

      {nothingFound ? (
        <Text style={styles.exEmpty}>{t('records.extract.nothingFound')}</Text>
      ) : (
        <>
          {sel.vaccinations.length > 0 && <ExGroup icon="needle" label={t('records.extract.vaccinations')} />}
          {sel.vaccinations.map((v, i) => (
            <PickRow key={`vax-${i}`} label={t('records.extract.includeVaccine', { name: v.name || i + 1 })} included={v.included} onToggle={() => setVax(i, { included: !v.included })}>
              <TextInput style={styles.exInput} value={v.name} placeholder={t('records.extract.vaccineName')} placeholderTextColor={ui.placeholder} onChangeText={(text) => setVax(i, { name: text })} />
              <View style={styles.exDates}>
                <ExDate label={t('records.extract.given')} value={v.administered} onChange={(text) => setVax(i, { administered: text })} />
                <ExDate label={t('records.extract.nextDue')} value={v.due} onChange={(text) => setVax(i, { due: text })} />
              </View>
            </PickRow>
          ))}

          {sel.medications.length > 0 && <ExGroup icon="pill" label={t('records.extract.medications')} />}
          {sel.medications.map((m, i) => (
            <PickRow key={`med-${i}`} label={t('records.extract.includeMedication', { name: m.name || i + 1 })} included={m.included} onToggle={() => setMed(i, { included: !m.included })}>
              <TextInput style={styles.exInput} value={m.name} placeholder={t('records.extract.medicationName')} placeholderTextColor={ui.placeholder} onChangeText={(text) => setMed(i, { name: text })} />
              <View style={styles.exDates}>
                <TextInput style={[styles.exInput, { flex: 1 }]} value={m.dosage} placeholder={t('records.extract.dosage')} placeholderTextColor={ui.placeholder} onChangeText={(text) => setMed(i, { dosage: text })} />
                {!!m.frequency && (
                  <Text style={styles.exHint}>
                    {t(`records.extract.frequency.${m.frequency}`, { defaultValue: m.frequency.replace('_', ' ') })}
                  </Text>
                )}
              </View>
            </PickRow>
          ))}

          {sel.weight && (
            <>
              <ExGroup icon="scale-bathroom" label={t('records.extract.weight')} />
              <PickRow label={t('records.extract.includeWeight')} included={sel.weight.included} onToggle={() => setSel({ ...sel, weight: { ...sel.weight, included: !sel.weight.included } })}>
                <View style={styles.exDates}>
                  <TextInput style={[styles.exInput, { flex: 1 }]} value={sel.weight.value} keyboardType="decimal-pad" onChangeText={(text) => setSel({ ...sel, weight: { ...sel.weight, value: text } })} />
                  <Text style={styles.exHint}>{sel.weight.unit}</Text>
                  <ExDate label={t('records.extract.on')} value={sel.weight.date} onChange={(text) => setSel({ ...sel, weight: { ...sel.weight, date: text } })} />
                </View>
              </PickRow>
            </>
          )}

          {sel.expense && (
            <>
              <ExGroup icon="cash" label={t('records.extract.expense')} />
              <PickRow label={t('records.extract.includeExpense')} included={sel.expense.included} onToggle={() => setSel({ ...sel, expense: { ...sel.expense, included: !sel.expense.included } })}>
                <View style={styles.exDates}>
                  <TextInput style={[styles.exInput, { flex: 1 }]} value={sel.expense.amount} keyboardType="decimal-pad" onChangeText={(text) => setSel({ ...sel, expense: { ...sel.expense, amount: text } })} />
                  <ExDate label={t('records.extract.on')} value={sel.expense.date} onChange={(text) => setSel({ ...sel, expense: { ...sel.expense, date: text } })} />
                </View>
              </PickRow>
            </>
          )}

          {sel.clinic && (
            <>
              <ExGroup icon="hospital-building" label={t('records.extract.clinic')} />
              <PickRow label={t('records.extract.includeClinic')} included={sel.clinic.included} onToggle={() => setSel({ ...sel, clinic: { ...sel.clinic, included: !sel.clinic.included } })}>
                <TextInput style={styles.exInput} value={sel.clinic.name} placeholder={t('records.clinic.name')} placeholderTextColor={ui.placeholder} onChangeText={(text) => setSel({ ...sel, clinic: { ...sel.clinic, name: text } })} />
              </PickRow>
            </>
          )}
        </>
      )}

      {!!ex.suggested_title && (
        <PickRow label={t('records.extract.renameA11y', { title: ex.suggested_title })} included={sel.setTitle} onToggle={() => setSel({ ...sel, setTitle: !sel.setTitle })}>
          <Text style={styles.exToggleText} numberOfLines={2}>{t('records.extract.rename', { title: ex.suggested_title })}</Text>
        </PickRow>
      )}
      {!!ex.document_type && ex.document_type !== 'other' && (
        <PickRow label={t('records.extract.setCategory', { category: docMeta(ex.document_type).label })} included={sel.setCategory} onToggle={() => setSel({ ...sel, setCategory: !sel.setCategory })}>
          <Text style={styles.exToggleText}>{t('records.extract.setCategory', { category: docMeta(ex.document_type).label })}</Text>
        </PickRow>
      )}
    </FormSheet>
  );
}

// Info uses the vault's sky pair, not the accent — accent is for actions.
const BANNER_TONES = {
  danger: { bg: ui.dangerTint, fg: ui.dangerText },
  info: { bg: VAULT.bg, fg: VAULT.fg },
};

function Banner({ icon, tone = 'info', text }) {
  const colors = BANNER_TONES[tone] || BANNER_TONES.info;
  return (
    <View style={[styles.exBanner, { backgroundColor: colors.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.fg} />
      <Text style={[styles.exBannerText, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

function ExGroup({ icon, label }) {
  return (
    <View style={styles.exGroup}>
      <MaterialCommunityIcons name={icon} size={14} color={ui.subtle} />
      <Text style={[type.sectionLabel, { color: ui.subtle }]}>{label}</Text>
    </View>
  );
}

// `label` names what the checkbox includes; screen readers can't read it
// off the fields beside it.
function PickRow({ included, onToggle, label, children }) {
  return (
    <View style={styles.exRow}>
      <Pressable
        onPress={onToggle}
        hitSlop={hit}
        style={styles.exCheck}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: !!included }}
      >
        <MaterialCommunityIcons
          name={included ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
          size={22}
          color={included ? ui.accent : ui.subtle}
        />
      </Pressable>
      {/* Only the fields fade when excluded: a faded checkbox would drop
          below 3:1 and hide the very control that brings them back. */}
      <View style={[{ flex: 1, gap: 6 }, !included && { opacity: 0.45 }]}>{children}</View>
    </View>
  );
}

function ExDate({ label, value, onChange }) {
  const { t } = useTranslation();
  return (
    <View style={styles.exDateWrap}>
      <Text style={styles.exHint}>{label}</Text>
      <TextInput
        style={[styles.exInput, styles.exDateInput]}
        value={value}
        placeholder={t('records.extract.datePlaceholder')}
        placeholderTextColor={ui.placeholder}
        onChangeText={onChange}
        autoCapitalize="none"
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  header: { gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  loading: { paddingHorizontal: 20, paddingTop: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24, gap: 22 },
  quietLinks: { gap: 10 },
  scroll: { paddingBottom: 36 },
  hero: {
    marginHorizontal: 20,
    marginTop: 8,
    gap: 16,
    backgroundColor: VAULT.bg,
    borderColor: VAULT.bg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: ui.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { ...type.cardTitleSm, color: ui.ink },
  heroSub: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: VAULT.fg, marginTop: 2 },
  section: { marginHorizontal: 20, marginTop: 22 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  addLinkText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 10,
    minHeight: 64,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: VAULT.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  rowAction: { paddingHorizontal: 4 },
  callBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: ui.accentTint,
  },
  readPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.accent },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: ui.hairline,
  },
  moreText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  quietText: { ...type.body, fontSize: 13.5, color: ui.sub, flex: 1 },
  error: { ...type.secondary, color: ui.dangerText, marginTop: 12 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: 12,
  },
  pickerText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: ui.ink,
  },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: radii.control,
    borderWidth: 1.5,
    borderColor: ui.faint,
    borderStyle: 'dashed',
    backgroundColor: ui.background,
  },
  fileBtnPicked: { borderStyle: 'solid', borderColor: ui.successBorder, backgroundColor: ui.successTint },
  fileBtnText: { ...type.rowTitle, color: ui.sub, flex: 1 },
  fieldLabel: { color: ui.subtle, marginTop: 18, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // AI extraction review sheet
  exBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radii.control,
    marginBottom: 10,
  },
  exBannerText: { ...type.secondary, flex: 1 },
  exGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  exCheck: { paddingTop: 6 },
  exInput: {
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    color: ui.ink,
    minHeight: 40,
  },
  exDates: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exDateWrap: { flex: 1, gap: 3 },
  exDateInput: { minHeight: 36, paddingVertical: 4 },
  exHint: { ...type.secondary, color: ui.subtle },
  exToggleText: { ...type.rowTitle, color: ui.ink, paddingTop: 8 },
  exEmpty: { ...type.body, color: ui.sub, paddingVertical: 20, textAlign: 'center' },
});
