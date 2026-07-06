import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal,
  Alert, KeyboardAvoidingView, Platform, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useData } from '../../context/DataContext';
import { pickRecordImage } from '../../services/imagePicker';
import { buildExtractionPayload, extractionCount } from '../../utils/extraction';
import { colors, typography, spacing, radii, shadows } from '../../theme';

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
const statusColor = (s) =>
  s === 'completed' ? colors.secondary : s === 'cancelled' ? colors.outline : colors.tertiary;

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
    if (!url) { Alert.alert('Could not open', 'This file could not be opened.'); return; }
    Linking.openURL(url).catch(() => Alert.alert('Could not open', 'This file could not be opened.'));
  };

  const confirmDelete = (label, fn) =>
    Alert.alert('Delete', `Remove this ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: fn },
    ]);

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
      Alert.alert('Could not read document', e.message || 'Please try again.');
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
    Alert.alert(
      'Records added',
      `${added} record${added === 1 ? '' : 's'} added to ${petName || 'your pet'}'s profile.` +
        (skipped ? ` ${skipped} skipped (already existed).` : ''),
    );
    load();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onBackground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medical Records</Text>
        <View style={{ width: 40 }} />
      </View>

      {!records ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primaryContainer} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryContainer} />}
        >
          {/* Vet clinics */}
          <Section title="Vet Clinics" onAdd={() => setClinicModal(true)}>
            {clinics.length === 0 ? (
              <Empty icon="hospital-building" text={`Add ${petName || 'your pet'}'s vet clinic`} onPress={() => setClinicModal(true)} />
            ) : (
              clinics.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.tertiaryFixed }]}>
                    <MaterialCommunityIcons name="hospital-building" size={18} color={colors.tertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[c.vetName, c.phone].filter(Boolean).join(' · ') || c.email || c.address || 'Vet clinic'}
                    </Text>
                  </View>
                  {!!c.phone && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={hit} style={styles.rowAction}>
                      <MaterialCommunityIcons name="phone" size={18} color={colors.secondary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => confirmDelete('clinic', () => deleteClinic(petId, c.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Section>

          {/* Appointments */}
          <Section title="Appointments" onAdd={() => setApptModal(true)}>
            {appointments.length === 0 ? (
              <Empty icon="calendar-clock" text="Log a vet appointment" onPress={() => setApptModal(true)} />
            ) : (
              appointments.map((a) => (
                <View key={a.id} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: colors.primaryFixed }]}>
                    <MaterialCommunityIcons name="calendar-clock" size={18} color={colors.primaryContainer} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {fmtDateTime(a.scheduledAt)}{a.clinicName ? ` · ${a.clinicName}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor(a.status)}1f` }]}>
                    <Text style={[styles.statusText, { color: statusColor(a.status) }]}>{a.status}</Text>
                  </View>
                  <TouchableOpacity onPress={() => confirmDelete('appointment', () => deleteAppointment(petId, a.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Section>

          {/* Documents */}
          <Section title="Documents" onAdd={() => setDocModal(true)}>
            {documents.length === 0 ? (
              <Empty icon="folder-multiple-outline" text="Upload a photo of a record" onPress={() => setDocModal(true)} />
            ) : (
              documents.map((d) => {
                const m = docMeta(d.category);
                return (
                  <TouchableOpacity key={d.id} style={styles.row} activeOpacity={0.85} onPress={() => openDocument(d)}>
                    <View style={[styles.rowIcon, { backgroundColor: colors.secondaryFixed }]}>
                      <MaterialCommunityIcons name={d.mime === 'application/pdf' ? 'file-pdf-box' : m.icon} size={18} color={colors.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{d.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {m.label}{d.sizeBytes ? ` · ${fmtSize(d.sizeBytes)}` : ''} · {fmtDate(d.createdAt)}
                      </Text>
                    </View>
                    {extractingId === d.id ? (
                      <ActivityIndicator size="small" color={colors.tertiary} style={styles.rowAction} />
                    ) : (
                      <TouchableOpacity onPress={() => startExtraction(d)} hitSlop={hit} style={styles.rowAction}>
                        <MaterialCommunityIcons
                          name={d.extraction?._applied_at ? 'check-decagram' : 'creation'}
                          size={18}
                          color={d.extraction?._applied_at ? colors.secondary : colors.tertiary}
                        />
                      </TouchableOpacity>
                    )}
                    <MaterialCommunityIcons name="open-in-new" size={16} color={colors.outlineVariant} />
                    <TouchableOpacity onPress={() => confirmDelete('document', () => deleteDocument(petId, d.id).then(load))} hitSlop={hit} style={styles.rowAction}>
                      <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                    </TouchableOpacity>
                  </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function Section({ title, onAdd, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={onAdd} style={styles.addIconBtn} hitSlop={hit}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

function Empty({ icon, text, onPress }) {
  return (
    <TouchableOpacity style={styles.empty} onPress={onPress} activeOpacity={0.88}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.primaryContainer} />
      <Text style={styles.emptyText}>{text}</Text>
    </TouchableOpacity>
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
    } catch (e) { setError(e.message || 'Could not save the clinic.'); } finally { setBusy(false); }
  };

  const field = (key, placeholder, opts = {}) => (
    <TextInput
      style={[styles.input, { marginTop: spacing.sm }]}
      placeholder={placeholder}
      placeholderTextColor={colors.outlineVariant}
      value={form[key]}
      onChangeText={(v) => { setForm({ ...form, [key]: v }); setError(null); }}
      {...opts}
    />
  );

  return (
    <Sheet visible={visible} title="Add vet clinic" onClose={close} onSave={save} busy={busy} saveLabel="Add Clinic" error={error}>
      <TextInput
        style={styles.input}
        placeholder="Clinic name"
        placeholderTextColor={colors.outlineVariant}
        value={form.name}
        onChangeText={(v) => { setForm({ ...form, name: v }); setError(null); }}
        autoFocus
      />
      {field('vet_name', 'Vet name (optional)')}
      {field('phone', 'Phone', { keyboardType: 'phone-pad' })}
      {field('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none' })}
      {field('address', 'Address')}
    </Sheet>
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
    } catch (e) { setError(e.message || 'Could not save the appointment.'); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="Log appointment" onClose={close} onSave={save} busy={busy} saveLabel="Save" error={error}>
      <TextInput
        style={styles.input}
        placeholder="Reason (e.g. Annual checkup)"
        placeholderTextColor={colors.outlineVariant}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
        autoFocus
      />
      <TouchableOpacity style={[styles.input, styles.pickerBtn]} onPress={() => setShowDate(true)} activeOpacity={0.85}>
        <MaterialCommunityIcons name="calendar" size={16} color={colors.primaryContainer} />
        <Text style={styles.pickerText}>{fmtDateTime(when.toISOString())}</Text>
      </TouchableOpacity>

      {clinics.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Clinic (optional)</Text>
          <View style={styles.chipWrap}>
            {clinics.map((c) => (
              <Chip key={c.id} label={c.name} active={clinicId === c.id} onPress={() => setClinicId(clinicId === c.id ? null : c.id)} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.chipWrap}>
        {APPT_STATUS.map((s) => (
          <Chip key={s} label={s} active={status === s} onPress={() => setStatus(s)} capitalize />
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
    </Sheet>
  );
}

function DocumentModal({ visible, onClose, onSave, onDone }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('lab');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setTitle(''); setCategory('lab'); setError(null); };
  const close = () => { reset(); onClose(); };

  const pick = async () => {
    setError(null);
    const res = await pickRecordImage();
    if (res.error) { setError(res.error === 'permission' ? 'Photo permission is required.' : 'Could not pick the file.'); return; }
    if (res.canceled) return;
    setFile(res);
    if (!title) setTitle(docMeta(category).label + ' record');
  };

  const save = async () => {
    if (!file || !title.trim()) return;
    setBusy(true); setError(null);
    try {
      await onSave(file, { title: title.trim(), category });
      reset(); onClose(); await onDone();
    } catch (e) { setError(e.message || 'Could not upload the document.'); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="Add document" onClose={close} onSave={save} busy={busy} saveLabel="Upload" error={error} saveDisabled={!file}>
      <TouchableOpacity style={styles.fileBtn} onPress={pick} activeOpacity={0.85}>
        <MaterialCommunityIcons name={file ? 'check-circle' : 'image-plus'} size={20} color={file ? colors.secondary : colors.primaryContainer} />
        <Text style={styles.fileBtnText} numberOfLines={1}>{file ? file.name : 'Choose a photo of the record'}</Text>
      </TouchableOpacity>
      <TextInput
        style={[styles.input, { marginTop: spacing.sm }]}
        placeholder="Title (e.g. Rabies certificate)"
        placeholderTextColor={colors.outlineVariant}
        value={title}
        onChangeText={(v) => { setTitle(v); setError(null); }}
      />
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.chipWrap}>
        {DOC_CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} icon={c.icon} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </View>
    </Sheet>
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
    <Sheet
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
        <Banner icon="alert" color={colors.error} text={`This document may belong to a different pet than ${petName || 'this one'}. Double-check before applying.`} />
      )}
      {!!ex.notes_for_owner && <Banner icon="information" color={colors.tertiary} text={ex.notes_for_owner} />}

      {nothingFound ? (
        <Text style={styles.exEmpty}>No medical data was found in this document.</Text>
      ) : (
        <>
          {sel.vaccinations.length > 0 && <ExGroup icon="needle" label="Vaccinations" />}
          {sel.vaccinations.map((v, i) => (
            <PickRow key={`vax-${i}`} included={v.included} onToggle={() => setVax(i, { included: !v.included })}>
              <TextInput style={styles.exInput} value={v.name} placeholder="Vaccine name" placeholderTextColor={colors.outlineVariant} onChangeText={(t) => setVax(i, { name: t })} />
              <View style={styles.exDates}>
                <ExDate label="Given" value={v.administered} onChange={(t) => setVax(i, { administered: t })} />
                <ExDate label="Next due" value={v.due} onChange={(t) => setVax(i, { due: t })} />
              </View>
            </PickRow>
          ))}

          {sel.medications.length > 0 && <ExGroup icon="pill" label="Medications" />}
          {sel.medications.map((m, i) => (
            <PickRow key={`med-${i}`} included={m.included} onToggle={() => setMed(i, { included: !m.included })}>
              <TextInput style={styles.exInput} value={m.name} placeholder="Medication name" placeholderTextColor={colors.outlineVariant} onChangeText={(t) => setMed(i, { name: t })} />
              <View style={styles.exDates}>
                <TextInput style={[styles.exInput, { flex: 1 }]} value={m.dosage} placeholder="Dosage" placeholderTextColor={colors.outlineVariant} onChangeText={(t) => setMed(i, { dosage: t })} />
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
                <TextInput style={styles.exInput} value={sel.clinic.name} placeholder="Clinic name" placeholderTextColor={colors.outlineVariant} onChangeText={(t) => setSel({ ...sel, clinic: { ...sel.clinic, name: t } })} />
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
    </Sheet>
  );
}

function Banner({ icon, color, text }) {
  return (
    <View style={[styles.exBanner, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={[styles.exBannerText, { color }]}>{text}</Text>
    </View>
  );
}

function ExGroup({ icon, label }) {
  return (
    <View style={styles.exGroup}>
      <MaterialCommunityIcons name={icon} size={15} color={colors.onSurfaceVariant} />
      <Text style={styles.exGroupText}>{label}</Text>
    </View>
  );
}

function PickRow({ included, onToggle, children }) {
  return (
    <View style={[styles.exRow, !included && { opacity: 0.45 }]}>
      <TouchableOpacity onPress={onToggle} hitSlop={hit} style={styles.exCheck}>
        <MaterialCommunityIcons
          name={included ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
          size={22}
          color={included ? colors.secondary : colors.outlineVariant}
        />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: spacing.xs }}>{children}</View>
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
        placeholderTextColor={colors.outlineVariant}
        onChangeText={onChange}
        autoCapitalize="none"
      />
    </View>
  );
}

function Chip({ label, icon, active, onPress, capitalize }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.85}>
      {icon && <MaterialCommunityIcons name={icon} size={13} color={active ? colors.onPrimary : colors.onSurfaceVariant} />}
      <Text style={[styles.chipText, capitalize && { textTransform: 'capitalize' }, active && { color: colors.onPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Sheet({ visible, title, onClose, onSave, busy, saveLabel, error, saveDisabled, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.88}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalAdd, (busy || saveDisabled) && { opacity: 0.5 }]}
              onPress={onSave}
              disabled={busy || saveDisabled}
              activeOpacity={0.88}
            >
              <Text style={styles.modalAddText}>{busy ? 'Saving…' : saveLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.margin, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...typography.titleLg, color: colors.onBackground },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: spacing.xl },
  section: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radii.xl,
    ...shadows.card, borderWidth: 1, borderColor: colors.surfaceContainerLow,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { ...typography.titleLg, color: colors.onSurface },
  addIconBtn: {
    width: 30, height: 30, borderRadius: radii.full,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceContainerLow,
  },
  rowIcon: { width: 38, height: 38, borderRadius: radii.full, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { ...typography.labelMd, color: colors.onSurface },
  rowSub: { ...typography.labelSm, color: colors.onSurfaceVariant, marginTop: 1 },
  rowAction: { paddingLeft: spacing.xs },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.full },
  statusText: { ...typography.labelSm, textTransform: 'capitalize' },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.lg,
    borderWidth: 1.5, borderColor: colors.outlineVariant, borderStyle: 'dashed',
  },
  emptyText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl,
    padding: spacing.lg, paddingBottom: spacing.xl, maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: radii.full, backgroundColor: colors.outlineVariant, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.titleLg, color: colors.onSurface, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
    ...typography.bodyMd, color: colors.onSurface, minHeight: 50,
  },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pickerText: { ...typography.bodyMd, color: colors.onSurface },
  fileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.lg,
    borderWidth: 1.5, borderColor: colors.outlineVariant, borderStyle: 'dashed',
  },
  fileBtnText: { ...typography.labelMd, color: colors.onSurfaceVariant, flex: 1 },
  fieldLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, marginTop: spacing.md, marginBottom: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow, borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.labelSm, color: colors.onSurfaceVariant },
  error: { ...typography.labelSm, color: colors.error, marginTop: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancel: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', minHeight: 48, justifyContent: 'center',
  },
  modalCancelText: { ...typography.labelMd, color: colors.onSurface },
  modalAdd: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.lg,
    backgroundColor: colors.primary, alignItems: 'center', minHeight: 48, justifyContent: 'center', ...shadows.button,
  },
  modalAddText: { ...typography.labelMd, color: colors.onPrimary },

  // AI extraction review sheet
  exBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    padding: spacing.sm, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm,
  },
  exBannerText: { ...typography.labelSm, flex: 1 },
  exGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.xs },
  exGroupText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  exRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.xs, marginTop: spacing.xs,
  },
  exCheck: { paddingTop: 6 },
  exInput: {
    backgroundColor: colors.surfaceContainerLow, borderRadius: radii.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.outlineVariant,
    ...typography.bodyMd, color: colors.onSurface, minHeight: 40,
  },
  exDates: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  exDateWrap: { flex: 1, gap: 2 },
  exDateInput: { minHeight: 36, paddingVertical: 4 },
  exHint: { ...typography.labelSm, color: colors.onSurfaceVariant },
  exToggleText: { ...typography.labelMd, color: colors.onSurface, paddingTop: 8 },
  exEmpty: { ...typography.bodyMd, color: colors.onSurfaceVariant, paddingVertical: spacing.md, textAlign: 'center' },
});
