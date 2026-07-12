import React, { useState, useEffect, useCallback } from 'react';
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
import { ui, type, radii } from '../../theme';
import { Card, Chip, Button, Sheet, ConfirmDialog, showToast } from '../../components';

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
const APPT_STATUS_STYLE = {
  scheduled: { bg: ui.accentTint, fg: ui.accent },
  completed: { bg: ui.successTint, fg: ui.success },
  cancelled: { bg: ui.track, fg: ui.sub },
};
const apptStyle = (s) => APPT_STATUS_STYLE[s] || APPT_STATUS_STYLE.scheduled;

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export default function MedicalRecordsScreen({ navigation, route }) {
  const { petId, petName } = route.params;
  const {
    getPetRecords, addClinic, deleteClinic,
    addAppointment, deleteAppointment, addDocument, deleteDocument, getDocumentUrl,
    extractDocument, applyExtraction,
  } = useData();

  const [records, setRecords] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clinicModal, setClinicModal] = useState(false);
  const [apptModal, setApptModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const data = await getPetRecords(petId);
    if (data) setRecords(data);
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

  const openDocument = async (doc) => {
    // Files live on a private disk — fetch a short-lived signed URL to view.
    const url = await getDocumentUrl(petId, doc.id);
    if (!url) { showToast('Could not open this file'); return; }
    Linking.openURL(url).catch(() => showToast('Could not open this file'));
  };

  const confirmDelete = (label, fn) =>
    setConfirm({
      title: `Delete ${label}`,
      message: `Remove this ${label}?`,
      confirmLabel: 'Delete',
      destructive: true,
      action: async () => {
        await fn();
        showToast(`${cap(label)} removed`);
      },
    });

  // AI intake: extract once (the backend caches a completed extraction),
  // then open the review sheet. Re-opening a reviewed document is free.
  const startExtraction = async (doc) => {
    if (doc.extractionStatus === 'done' && doc.extraction) { setReviewDoc(doc); return; }
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.background }]}
          onPress={() => navigation.goBack()}
          hitSlop={hit}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Medical Records</Text>
          {petName ? <Text style={styles.pageSubtitle}>{petName}</Text> : null}
        </View>
      </View>

      {!records ? (
        <View style={styles.loading}><ActivityIndicator color={ui.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
        >
          {/* Vet clinics */}
          <Section title="Vet clinics" onAdd={() => setClinicModal(true)}>
            {clinics.length === 0 ? (
              <Empty icon="hospital-building" text={`Add ${petName || 'your pet'}'s vet clinic`} onPress={() => setClinicModal(true)} />
            ) : (
              clinics.map((c, i) => (
                <View key={c.id} style={[styles.row, i < clinics.length - 1 && styles.rowDivider]}>
                  <View style={styles.rowIcon}>
                    <MaterialCommunityIcons name="hospital-building" size={18} color={ui.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[c.vetName, c.phone].filter(Boolean).join(' · ') || c.email || c.address || 'Vet clinic'}
                    </Text>
                  </View>
                  {!!c.phone && (
                    <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={hit} style={styles.rowAction}>
                      <MaterialCommunityIcons name="phone" size={18} color={ui.accent} />
                    </Pressable>
                  )}
                  <Pressable onPress={() => confirmDelete('clinic', () => deleteClinic(petId, c.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                    <MaterialCommunityIcons name="close" size={16} color={ui.faint} />
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          {/* Appointments */}
          <Section title="Appointments" onAdd={() => setApptModal(true)}>
            {appointments.length === 0 ? (
              <Empty icon="calendar-clock" text="Log a vet appointment" onPress={() => setApptModal(true)} />
            ) : (
              appointments.map((a, i) => (
                <View key={a.id} style={[styles.row, i < appointments.length - 1 && styles.rowDivider]}>
                  <View style={styles.rowIcon}>
                    <MaterialCommunityIcons name="calendar-clock" size={18} color={ui.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {fmtDateTime(a.scheduledAt)}{a.clinicName ? ` · ${a.clinicName}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: apptStyle(a.status).bg }]}>
                    <Text style={[styles.statusText, { color: apptStyle(a.status).fg }]}>{a.status}</Text>
                  </View>
                  <Pressable onPress={() => confirmDelete('appointment', () => deleteAppointment(petId, a.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                    <MaterialCommunityIcons name="close" size={16} color={ui.faint} />
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          {/* Documents */}
          <Section title="Documents" onAdd={() => setDocModal(true)}>
            {documents.length === 0 ? (
              <Empty icon="folder-multiple-outline" text="Upload a photo of a record" onPress={() => setDocModal(true)} />
            ) : (
              documents.map((d, i) => {
                const m = docMeta(d.category);
                return (
                  <Pressable
                    key={d.id}
                    style={({ pressed }) => [
                      styles.row,
                      i < documents.length - 1 && styles.rowDivider,
                      pressed && { backgroundColor: '#fffdf8' },
                    ]}
                    onPress={() => openDocument(d)}
                  >
                    <View style={styles.rowIcon}>
                      <MaterialCommunityIcons name={d.mime === 'application/pdf' ? 'file-pdf-box' : m.icon} size={18} color={ui.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{d.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {m.label}{d.sizeBytes ? ` · ${fmtSize(d.sizeBytes)}` : ''} · {fmtDate(d.createdAt)}
                      </Text>
                    </View>
                    {extractingId === d.id ? (
                      <ActivityIndicator size="small" color={ui.accent} style={styles.rowAction} />
                    ) : (
                      <Pressable onPress={() => startExtraction(d)} hitSlop={hit} style={styles.rowAction}>
                        <MaterialCommunityIcons
                          name={d.extraction?._applied_at ? 'check-decagram' : 'creation'}
                          size={18}
                          color={d.extraction?._applied_at ? ui.success : ui.accent}
                        />
                      </Pressable>
                    )}
                    <MaterialCommunityIcons name="open-in-new" size={16} color={ui.faint} />
                    <Pressable onPress={() => confirmDelete('document', () => deleteDocument(petId, d.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                      <MaterialCommunityIcons name="close" size={16} color={ui.faint} />
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </Section>
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
        petName={petName}
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

function Section({ title, onAdd, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[type.sectionLabel, { color: ui.subtle }]}>{title}</Text>
        <Pressable onPress={onAdd} hitSlop={hit} style={styles.addLink}>
          <MaterialCommunityIcons name="plus" size={14} color={ui.accent} />
          <Text style={styles.addLinkText}>Add</Text>
        </Pressable>
      </View>
      <Card>{children}</Card>
    </View>
  );
}

function Empty({ icon, text, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.empty, pressed && { backgroundColor: '#fffdf8' }]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon} size={20} color={ui.faint} />
      <Text style={styles.emptyText}>{text}</Text>
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
        {!!error && <Text style={styles.error}>{error}</Text>}
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

function ClinicModal({ visible, onClose, onSave, onDone }) {
  const [form, setForm] = useState({ name: '', vet_name: '', phone: '', email: '', address: '', notes: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setForm({ name: '', vet_name: '', phone: '', email: '', address: '', notes: '' }); setError(null); };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true); setError(null);
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
    } catch (e) { setError(e.message || 'Could not save the clinic.'); } finally { setBusy(false); }
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
    <FormSheet visible={visible} title="Add vet clinic" onClose={close} onSave={save} busy={busy} saveLabel="Add clinic" error={error}>
      <TextInput
        style={styles.input}
        placeholder="Clinic name"
        placeholderTextColor={ui.subtle}
        value={form.name}
        onChangeText={(v) => { setForm({ ...form, name: v }); setError(null); }}
        autoFocus
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
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(''); setWhen(new Date()); setClinicId(null); setStatus('scheduled'); setNotes(''); setError(null); };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    try {
      await onSave({
        title: title.trim(),
        scheduled_at: when.toISOString(),
        clinic_id: clinicId,
        status,
        notes: notes.trim() || null,
      });
      reset(); onClose(); await onDone();
      showToast('Appointment logged');
    } catch (e) { setError(e.message || 'Could not save the appointment.'); } finally { setBusy(false); }
  };

  return (
    <FormSheet visible={visible} title="Log appointment" onClose={close} onSave={save} busy={busy} saveLabel="Save" error={error}>
      <TextInput
        style={styles.input}
        placeholder="Reason (e.g. Annual checkup)"
        placeholderTextColor={ui.subtle}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        autoFocus
      />
      <Pressable
        style={({ pressed }) => [styles.pickerBtn, pressed && { backgroundColor: '#fffdf8' }]}
        onPress={() => setShowDate(true)}
      >
        <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={ui.accent} />
        <Text style={styles.pickerText}>{fmtDateTime(when.toISOString())}</Text>
        <MaterialCommunityIcons name="pencil-outline" size={14} color={ui.faint} />
      </Pressable>

      {clinics.length > 0 && (
        <>
          <Text style={[type.sectionLabel, styles.fieldLabel]}>Clinic (optional)</Text>
          <View style={styles.chipWrap}>
            {clinics.map((c) => (
              <Chip key={c.id} label={c.name} active={clinicId === c.id} onPress={() => setClinicId(clinicId === c.id ? null : c.id)} />
            ))}
          </View>
        </>
      )}

      <Text style={[type.sectionLabel, styles.fieldLabel]}>Status</Text>
      <View style={styles.chipWrap}>
        {APPT_STATUS.map((s) => (
          <Chip key={s} label={cap(s)} active={status === s} onPress={() => setStatus(s)} />
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
  const [busy, setBusy] = useState(false);
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

  const save = async () => {
    if (!file || !title.trim()) return;
    if (failed) track('document_upload_retried');
    setBusy(true); setError(null);
    try {
      await onSave(file, { title: title.trim(), category });
      reset(); onClose(); await onDone();
      showToast('Document uploaded');
    } catch (e) {
      // Keep the ENTIRE form + picked file; the banner + retry button take
      // over from here.
      setFailed(true);
      track('document_upload_failed');
    } finally { setBusy(false); }
  };

  return (
    <FormSheet
      visible={visible}
      title="Add document"
      onClose={close}
      onSave={save}
      busy={busy}
      saveLabel={failed ? 'Retry upload' : 'Upload'}
      busyLabel="Uploading…"
      error={error}
      saveDisabled={!file}
    >
      {failed && !busy && (
        <Banner icon="alert-circle-outline" tone="danger" text="Upload failed — nothing was lost." />
      )}
      <Pressable
        style={({ pressed }) => [styles.fileBtn, pressed && { backgroundColor: '#fffdf8' }]}
        onPress={pick}
      >
        <MaterialCommunityIcons name={file ? 'check-circle' : 'image-plus'} size={20} color={file ? ui.success : ui.accent} />
        <Text style={styles.fileBtnText} numberOfLines={1}>{file ? file.name : 'Choose a photo of the record'}</Text>
      </Pressable>
      <TextInput
        style={[styles.input, { marginTop: 12 }]}
        placeholder="Title (e.g. Rabies certificate)"
        placeholderTextColor={ui.subtle}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
      />
      <Text style={[type.sectionLabel, styles.fieldLabel]}>Category</Text>
      <View style={styles.chipWrap}>
        {DOC_CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} />
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
  const [busy, setBusy] = useState(false);

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

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      const result = await onApply(buildExtractionPayload(sel));
      onDone(result);
    } catch (e) { setError(e.message || 'Could not apply the records.'); } finally { setBusy(false); }
  };

  return (
    <FormSheet
      visible={visible}
      title="Review extracted info"
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

const BANNER_TONES = {
  danger: { bg: ui.dangerTint, fg: ui.dangerText },
  info: { bg: ui.accentTint, fg: ui.accent },
};

function Banner({ icon, tone = 'info', text }) {
  const t = BANNER_TONES[tone] || BANNER_TONES.info;
  return (
    <View style={[styles.exBanner, { backgroundColor: t.bg }]}>
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
      <Pressable onPress={onToggle} hitSlop={hit} style={styles.exCheck}>
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 6,
  },
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
  pageTitle: { ...type.screenTitle, color: ui.ink },
  pageSubtitle: { ...type.secondary, color: ui.sub, marginTop: 2 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 32 },
  section: { marginHorizontal: 24, marginTop: 18 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addLinkText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.track,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { ...type.rowTitle, color: ui.ink },
  rowSub: { ...type.secondary, color: ui.sub, marginTop: 1 },
  rowAction: { paddingLeft: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyText: { ...type.body, fontSize: 13, color: ui.subtle },
  error: { ...type.secondary, color: ui.danger, marginTop: 12 },
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
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: radii.control,
    borderWidth: 1.5,
    borderColor: ui.faint,
    borderStyle: 'dashed',
    backgroundColor: ui.background,
  },
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
