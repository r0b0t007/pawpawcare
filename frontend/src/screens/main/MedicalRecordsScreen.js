import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { pickRecordImage } from '../../services/imagePicker';
import { track } from '../../services/analytics';
import { buildExtractionPayload, extractionCount } from '../../utils/extraction';
import { fmtClock, fmtDay, fmtFull, relativeDay } from '../../utils/dates';
import { petById } from '../../utils/pets';
import { useInFlight } from '../../hooks/useInFlight';
import { ui, type, radii, motion, photos, PET_COLOR_PAIRS } from '../../theme';
import {
  Card, Chip, Button, Sheet, ConfirmDialog, DeleteButton, EmptyState, PetFace, Skeleton, showToast, ScreenHeader,
} from '../../components';

// The medical vault ("Lively & Light"): the pet's face and a one-line summary
// up top, then one sky hero card with the single primary action (upload a
// record — the thing people come here to do) and the next vet visit. Below,
// three calm sections — documents, appointments, clinics — each showing its
// first few rows with the rest one tap away (progressive disclosure). Deletes
// stay behind ConfirmDialog and only confirm what the server actually removed.

const VAULT = PET_COLOR_PAIRS[1]; // sky identity pair, as on the Health hub's vault card
const PREVIEW_ROWS = 3;

const DOC_CATEGORIES = [
  { id: 'lab', label: 'Lab', icon: 'test-tube' },
  { id: 'vaccination', label: 'Vaccine', icon: 'needle' },
  { id: 'prescription', label: 'Rx', icon: 'pill' },
  { id: 'invoice', label: 'Invoice', icon: 'receipt' },
  { id: 'imaging', label: 'Imaging', icon: 'radiology-box-outline' },
  { id: 'insurance', label: 'Insurance', icon: 'shield-check' },
  { id: 'other', label: 'Other', icon: 'file-document-outline' },
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export default function MedicalRecordsScreen({ navigation, route }) {
  const { petId, petName } = route.params;
  const {
    pets, getPetRecords, addClinic, deleteClinic,
    addAppointment, deleteAppointment, addDocument, deleteDocument, getDocumentUrl,
    extractDocument, applyExtraction,
  } = useData();
  const pet = petById(pets, petId);
  const name = pet?.name || petName;

  const [records, setRecords] = useState(null);
  // getPetRecords resolves null on failure: say so and offer a retry instead
  // of leaving the loading placeholders up forever.
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clinicModal, setClinicModal] = useState(false);
  const [apptModal, setApptModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // AI reads are paid: one at a time, and a double tap never starts two.
  const { run: runExtract, isBusy: isExtractBusy } = useInFlight();

  const load = useCallback(async () => {
    const data = await getPetRecords(petId);
    if (data) setRecords(data);
    setLoadFailed(!data);
  }, [getPetRecords, petId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
    documents.length && plural(documents.length, 'document'),
    appointments.length && plural(appointments.length, 'visit'),
    clinics.length && plural(clinics.length, 'clinic'),
  ].filter(Boolean).join(' · ');

  const openDocument = async (doc) => {
    // Files live on a private disk — fetch a short-lived signed URL to view.
    const url = await getDocumentUrl(petId, doc.id);
    if (!url) { showToast('Could not open this file'); return; }
    Linking.openURL(url).catch(() => showToast('Could not open this file'));
  };

  // Deletes resolve true/false (DataContext contract): only a removal the
  // server confirmed says so; a failure keeps the row and offers a retry.
  const confirmDelete = (label, remove) =>
    setConfirm({
      title: `Delete ${label}?`,
      message: `Remove this ${label} from ${name || 'this pet'}'s vault?`,
      confirmLabel: 'Delete',
      destructive: true,
      action: async () => {
        if (await remove()) {
          showToast(`${cap(label)} removed`);
          load();
        } else {
          showToast(`Couldn't remove the ${label}. Try again.`);
        }
      },
    });

  // AI intake: extract once (the backend caches a completed extraction),
  // then open the review sheet. Re-opening a reviewed document is free.
  const startExtraction = (doc) => {
    if (doc.extractionStatus === 'done' && doc.extraction) { setReviewDoc(doc); return undefined; }
    if (isExtractBusy('extract')) {
      showToast('Still reading another record. Try again in a moment.');
      return undefined;
    }
    return runExtract('extract', async () => {
      setExtractingId(doc.id);
      try {
        const updated = await extractDocument(petId, doc.id);
        setReviewDoc(updated);
        load();
      } catch (e) {
        showToast(e.message || 'Could not read the document');
      } finally {
        setExtractingId(null);
      }
    });
  };

  const onApplied = (result) => {
    setReviewDoc(null);
    const added =
      (result.vaccinations?.length || 0) + (result.medications?.length || 0) +
      (result.weight ? 1 : 0) + (result.expense ? 1 : 0) + (result.clinic ? 1 : 0);
    const skipped = result.skipped?.length || 0;
    showToast(
      `${added} record${added === 1 ? '' : 's'} added` +
        (skipped ? ` · ${skipped} skipped` : ''),
    );
    load();
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
        accessibilityHint="Opens the file"
        // One element for screen readers, so the Read and Delete buttons
        // inside can't be focused on their own — expose them as actions.
        accessibilityActions={[
          { name: 'activate', label: 'Open' },
          { name: 'read', label: applied ? 'Review what was read' : 'Read with AI' },
          { name: 'delete', label: 'Delete' },
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
            accessibilityLabel={`Review what was read from ${d.title}`}
          >
            <MaterialCommunityIcons name="check-decagram" size={20} color={ui.success} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => startExtraction(d)}
            hitSlop={hit}
            style={({ pressed }) => [styles.readPill, pressed && { opacity: motion.pressOpacitySoft }]}
            accessibilityRole="button"
            accessibilityLabel={`Read ${d.title} with AI`}
          >
            <MaterialCommunityIcons name="creation" size={14} color={ui.accent} />
            <Text style={styles.readPillText}>Read</Text>
          </Pressable>
        )}
        <DeleteButton label={`Delete ${d.title}`} onPress={() => confirmDelete('document', () => deleteDocument(petId, d.id))} />
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
        <View style={[styles.statusTag, { backgroundColor: s.bg }]} accessible accessibilityLabel={cap(a.status)}>
          <MaterialCommunityIcons name={s.icon} size={12} color={s.fg} />
          <Text style={[styles.statusText, { color: s.fg }]}>{cap(a.status)}</Text>
        </View>
        <DeleteButton label={`Delete ${a.title}`} onPress={() => confirmDelete('appointment', () => deleteAppointment(petId, a.id))} />
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
          {[c.vetName, c.phone].filter(Boolean).join(' · ') || c.email || c.address || 'Vet clinic'}
        </Text>
      </View>
      {!!c.phone && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${c.phone}`)}
          hitSlop={hit}
          style={styles.callBtn}
          accessibilityRole="button"
          accessibilityLabel={`Call ${c.name}`}
        >
          <MaterialCommunityIcons name="phone" size={17} color={ui.accent} />
        </Pressable>
      )}
      <DeleteButton label={`Delete ${c.name}`} onPress={() => confirmDelete('clinic', () => deleteClinic(petId, c.id))} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={name ? `${name}'s vault` : 'Medical vault'}
        subtitle={!records
          ? (loadFailed ? "Couldn't open the vault" : 'Opening the vault…')
          : summary || 'Vet records, lab results & documents'}
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
            photo={photos.emptyBlanket}
            title="We couldn't open the vault"
            body="Check your connection, then try again. Nothing in it has changed."
            actionLabel="Try again"
            actionIcon="refresh"
            onAction={onRefresh}
          />
        </ScrollView>
      ) : !records ? (
        // Placeholders where the cards land — no spinner-only screen.
        <View style={styles.loading} accessibilityLabel="Loading records">
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
            photo={photos.emptyBlanket}
            title={`Start ${name ? `${name}'s` : 'the'} vault`}
            body="Snap a vaccine certificate, a lab result or an invoice. We can read it and add the records for you."
            actionLabel="Upload a record"
            actionIcon="camera-plus-outline"
            onAction={() => setDocModal(true)}
          />
          <View style={styles.quietLinks}>
            <QuietLink icon="hospital-building" label="Add a vet clinic" onPress={() => setClinicModal(true)} />
            <QuietLink icon="calendar-clock" label="Log a vet visit" onPress={() => setApptModal(true)} />
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
                <Text style={styles.heroTitle}>Everything a vet might ask for</Text>
                <Text style={styles.heroSub}>
                  {nextVisit
                    ? `Next visit ${relativeDay(new Date(nextVisit.scheduledAt))}: ${nextVisit.title}`
                    : 'Private to you and your care team'}
                </Text>
              </View>
            </View>
            <Button label="Upload a record" icon="camera-plus-outline" onPress={() => setDocModal(true)} />
          </Card>

          <Section
            title="Documents"
            items={documents}
            renderItem={renderDocument}
            empty={<QuietLink icon="folder-multiple-outline" label="Upload a photo of a record" onPress={() => setDocModal(true)} />}
          />
          <Section
            title="Vet visits"
            onAdd={() => setApptModal(true)}
            addLabel="Log a vet visit"
            items={appointments}
            renderItem={renderAppointment}
            empty={<QuietLink icon="calendar-clock" label="Log a vet visit" onPress={() => setApptModal(true)} />}
          />
          <Section
            title="Clinics"
            onAdd={() => setClinicModal(true)}
            addLabel="Add a vet clinic"
            items={clinics}
            renderItem={renderClinic}
            empty={<QuietLink icon="hospital-building" label={`Add ${name || 'your pet'}'s vet clinic`} onPress={() => setClinicModal(true)} />}
          />
        </ScrollView>
      )}

      <ClinicModal
        visible={clinicModal}
        onClose={() => setClinicModal(false)}
        onSave={(data) => addClinic(petId, data)}
        onDone={load}
      />
      <AppointmentModal
        visible={apptModal}
        clinics={clinics}
        onClose={() => setApptModal(false)}
        onSave={(data) => addAppointment(petId, data)}
        onDone={load}
      />
      <DocumentModal
        visible={docModal}
        onClose={() => setDocModal(false)}
        onSave={(file, fields) => addDocument(petId, file, fields)}
        onDone={load}
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
            <Text style={styles.addLinkText}>Add</Text>
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
            <Text style={styles.moreText}>{expanded ? 'Show less' : `Show ${hidden} more`}</Text>
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
function FormSheet({ visible, title, onClose, onSave, busy, saveLabel, busyLabel = 'Saving…', error, saveDisabled, children }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} style={{ maxHeight: '88%' }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
        {!!error && <Text style={styles.error} selectable>{error}</Text>}
      </ScrollView>
      <View style={styles.sheetActions}>
        <Button variant="soft" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={busy ? busyLabel : saveLabel}
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
function ClinicModal({ visible, onClose, onSave, onDone }) {
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
        reset(); onClose(); await onDone();
        showToast('Clinic added');
      } catch (e) { setError(e.message || 'Could not save the clinic.'); }
    });
  };

  const field = (key, placeholder, opts = {}) => (
    <TextInput
      style={[styles.input, { marginTop: 12 }]}
      placeholder={placeholder}
      placeholderTextColor={ui.subtle}
      value={form[key]}
      onChangeText={(v) => { setForm({ ...form, [key]: v }); setError(null); }}
      {...opts}
    />
  );

  return (
    <FormSheet visible={visible} title="Add vet clinic" onClose={close} onSave={save} busy={busy} saveLabel="Add clinic" error={error} saveDisabled={!form.name.trim()}>
      <TextInput
        style={styles.input}
        placeholder="Clinic name"
        placeholderTextColor={ui.subtle}
        value={form.name}
        onChangeText={(v) => { setForm({ ...form, name: v }); setError(null); }}
        autoFocus
        accessibilityLabel="Clinic name"
      />
      {field('vet_name', 'Vet name (optional)')}
      {field('phone', 'Phone', { keyboardType: 'phone-pad' })}
      {field('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none' })}
      {field('address', 'Address')}
    </FormSheet>
  );
}

function AppointmentModal({ visible, clinics, onClose, onSave, onDone }) {
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
        reset(); onClose(); await onDone();
        showToast('Appointment logged', { celebrate: true, actionType: 'appointment_logged' });
      } catch (e) { setError(e.message || 'Could not save the appointment.'); }
    });
  };

  return (
    <FormSheet visible={visible} title="Log a vet visit" onClose={close} onSave={save} busy={busy} saveLabel="Save" error={error} saveDisabled={!title.trim()}>
      <TextInput
        style={styles.input}
        placeholder="Reason (e.g. Annual checkup)"
        placeholderTextColor={ui.subtle}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        autoFocus
        accessibilityLabel="Reason for the visit"
      />
      <Pressable
        style={({ pressed }) => [styles.pickerBtn, pressed && { backgroundColor: ui.pressTint }]}
        onPress={() => setShowDate(true)}
        accessibilityRole="button"
        accessibilityLabel={`Date and time, ${fmtWhen(when.toISOString())}`}
      >
        <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={ui.accent} />
        <Text style={styles.pickerText}>{fmtWhen(when.toISOString())}</Text>
        <MaterialCommunityIcons name="pencil-outline" size={14} color={ui.faint} />
      </Pressable>

      {clinics.length > 0 && (
        <>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Clinic (optional)</Text>
          <View style={styles.chipWrap}>
            {clinics.map((c) => (
              <Chip accessibilityRole="radio" key={c.id} label={c.name} active={clinicId === c.id} onPress={() => setClinicId(clinicId === c.id ? null : c.id)} />
            ))}
          </View>
        </>
      )}

      <Text style={[type.sectionLabel, styles.fieldLabel]}>Status</Text>
      <View style={styles.chipWrap}>
        {APPT_STATUS.map((s) => (
          <Chip accessibilityRole="radio" key={s} label={cap(s)} active={status === s} onPress={() => setStatus(s)} />
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

function DocumentModal({ visible, onClose, onSave, onDone }) {
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
    if (res.error) { setError(res.error === 'permission' ? 'Photo permission is required.' : 'Could not pick the file.'); return; }
    if (res.canceled) return;
    setFile(res);
    setFailed(false); // a new file is a fresh attempt, not a retry
    if (!title) setTitle(docMeta(category).label + ' record');
  };

  const save = () => {
    if (!file || !title.trim()) return undefined;
    return run('save', async () => {
      if (failed) track('document_upload_retried');
      setError(null);
      try {
        await onSave(file, { title: title.trim(), category });
        reset(); onClose(); await onDone();
        showToast('Document uploaded');
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
      title="Upload a record"
      onClose={close}
      onSave={save}
      busy={busy}
      saveLabel={failed ? 'Retry upload' : 'Upload'}
      busyLabel="Uploading…"
      error={error}
      saveDisabled={!file || !title.trim()}
    >
      {failed && !busy && (
        <Banner icon="alert-circle-outline" tone="danger" text="Upload failed — nothing was lost." />
      )}
      <Pressable
        style={({ pressed }) => [styles.fileBtn, file && styles.fileBtnPicked, pressed && { backgroundColor: ui.pressTint }]}
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={file ? `Chosen file ${file.name}, tap to change` : 'Choose a photo of the record'}
      >
        <MaterialCommunityIcons name={file ? 'check-circle' : 'image-plus'} size={22} color={file ? ui.success : VAULT.fg} />
        <Text style={styles.fileBtnText} numberOfLines={1}>{file ? file.name : 'Choose a photo of the record'}</Text>
      </Pressable>
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        placeholder="Title (e.g. Rabies certificate)"
        placeholderTextColor={ui.subtle}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        accessibilityLabel="Document title"
      />
      <Text style={[type.sectionLabel, styles.fieldLabel]}>Category</Text>
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
        ? { included: true, value: String(ex.weight.value), unit: ex.weight.unit || 'kg', date: ex.weight.date || '' }
        : null,
      // Costs are opt-in — not everyone tracks expenses.
      expense: ex.total_cost
        ? { included: false, amount: String(ex.total_cost), date: ex.document_date || '' }
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
      } catch (e) { setError(e.message || 'Could not apply the records.'); }
    });

  return (
    <FormSheet
      visible={visible}
      title="Review what we read"
      onClose={onClose}
      onSave={apply}
      busy={busy}
      saveLabel={count > 0 ? `Apply ${count}` : 'Apply'}
      saveDisabled={count === 0 && !sel.setTitle && !sel.setCategory}
      error={error}
    >
      {ex.matches_pet === false && (
        <Banner icon="alert" tone="danger" text={`This document may belong to a different pet than ${petName || 'this one'}. Double-check before applying.`} />
      )}
      {!!ex.notes_for_owner && <Banner icon="information" tone="info" text={ex.notes_for_owner} />}

      {nothingFound ? (
        <Text style={styles.exEmpty}>No medical data was found in this document.</Text>
      ) : (
        <>
          {sel.vaccinations.length > 0 && <ExGroup icon="needle" label="Vaccinations" />}
          {sel.vaccinations.map((v, i) => (
            <PickRow key={`vax-${i}`} included={v.included} onToggle={() => setVax(i, { included: !v.included })}>
              <TextInput style={styles.exInput} value={v.name} placeholder="Vaccine name" placeholderTextColor={ui.subtle} onChangeText={(t) => setVax(i, { name: t })} />
              <View style={styles.exDates}>
                <ExDate label="Given" value={v.administered} onChange={(t) => setVax(i, { administered: t })} />
                <ExDate label="Next due" value={v.due} onChange={(t) => setVax(i, { due: t })} />
              </View>
            </PickRow>
          ))}

          {sel.medications.length > 0 && <ExGroup icon="pill" label="Medications" />}
          {sel.medications.map((m, i) => (
            <PickRow key={`med-${i}`} included={m.included} onToggle={() => setMed(i, { included: !m.included })}>
              <TextInput style={styles.exInput} value={m.name} placeholder="Medication name" placeholderTextColor={ui.subtle} onChangeText={(t) => setMed(i, { name: t })} />
              <View style={styles.exDates}>
                <TextInput style={[styles.exInput, { flex: 1 }]} value={m.dosage} placeholder="Dosage" placeholderTextColor={ui.subtle} onChangeText={(t) => setMed(i, { dosage: t })} />
                {!!m.frequency && <Text style={styles.exHint}>{m.frequency.replace('_', ' ')}</Text>}
              </View>
            </PickRow>
          ))}

          {sel.weight && (
            <>
              <ExGroup icon="scale-bathroom" label="Weight" />
              <PickRow included={sel.weight.included} onToggle={() => setSel({ ...sel, weight: { ...sel.weight, included: !sel.weight.included } })}>
                <View style={styles.exDates}>
                  <TextInput style={[styles.exInput, { flex: 1 }]} value={sel.weight.value} keyboardType="decimal-pad" onChangeText={(t) => setSel({ ...sel, weight: { ...sel.weight, value: t } })} />
                  <Text style={styles.exHint}>{sel.weight.unit}</Text>
                  <ExDate label="On" value={sel.weight.date} onChange={(t) => setSel({ ...sel, weight: { ...sel.weight, date: t } })} />
                </View>
              </PickRow>
            </>
          )}

          {sel.expense && (
            <>
              <ExGroup icon="cash" label="Expense" />
              <PickRow included={sel.expense.included} onToggle={() => setSel({ ...sel, expense: { ...sel.expense, included: !sel.expense.included } })}>
                <View style={styles.exDates}>
                  <TextInput style={[styles.exInput, { flex: 1 }]} value={sel.expense.amount} keyboardType="decimal-pad" onChangeText={(t) => setSel({ ...sel, expense: { ...sel.expense, amount: t } })} />
                  <ExDate label="On" value={sel.expense.date} onChange={(t) => setSel({ ...sel, expense: { ...sel.expense, date: t } })} />
                </View>
              </PickRow>
            </>
          )}

          {sel.clinic && (
            <>
              <ExGroup icon="hospital-building" label="Clinic" />
              <PickRow included={sel.clinic.included} onToggle={() => setSel({ ...sel, clinic: { ...sel.clinic, included: !sel.clinic.included } })}>
                <TextInput style={styles.exInput} value={sel.clinic.name} placeholder="Clinic name" placeholderTextColor={ui.subtle} onChangeText={(t) => setSel({ ...sel, clinic: { ...sel.clinic, name: t } })} />
              </PickRow>
            </>
          )}
        </>
      )}

      {!!ex.suggested_title && (
        <PickRow included={sel.setTitle} onToggle={() => setSel({ ...sel, setTitle: !sel.setTitle })}>
          <Text style={styles.exToggleText} numberOfLines={2}>Rename document to “{ex.suggested_title}”</Text>
        </PickRow>
      )}
      {!!ex.document_type && ex.document_type !== 'other' && (
        <PickRow included={sel.setCategory} onToggle={() => setSel({ ...sel, setCategory: !sel.setCategory })}>
          <Text style={styles.exToggleText}>Set category to {docMeta(ex.document_type).label}</Text>
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
  const t = BANNER_TONES[tone] || BANNER_TONES.info;
  return (
    <View style={[styles.exBanner, { backgroundColor: t.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <MaterialCommunityIcons name={icon} size={16} color={t.fg} />
      <Text style={[styles.exBannerText, { color: t.fg }]}>{text}</Text>
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

function PickRow({ included, onToggle, children }) {
  return (
    <View style={[styles.exRow, !included && { opacity: 0.45 }]}>
      <Pressable
        onPress={onToggle}
        hitSlop={hit}
        style={styles.exCheck}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!included }}
      >
        <MaterialCommunityIcons
          name={included ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
          size={22}
          color={included ? ui.accent : ui.faint}
        />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>{children}</View>
    </View>
  );
}

function ExDate({ label, value, onChange }) {
  return (
    <View style={styles.exDateWrap}>
      <Text style={styles.exHint}>{label}</Text>
      <TextInput
        style={[styles.exInput, styles.exDateInput]}
        value={value}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={ui.subtle}
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
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
    minHeight: 48,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
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
    borderColor: ui.controlBorder,
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
