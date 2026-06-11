import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal,
  Alert, KeyboardAvoidingView, Platform, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useData } from '../../context/DataContext';
import { pickRecordImage } from '../../services/imagePicker';
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
  } = useData();

  const [records, setRecords] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clinicModal, setClinicModal] = useState(false);
  const [apptModal, setApptModal] = useState(false);
  const [docModal, setDocModal] = useState(false);

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
});
