import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, BackHandler,
  ScrollView, KeyboardAvoidingView, Platform, Switch, Modal, Image, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useData } from '../../context/DataContext';
import { pickAndUploadImage } from '../../services/imagePicker';
import { track } from '../../services/analytics';
import { useInFlight } from '../../hooks/useInFlight';
import { fmtFull, parseDay } from '../../utils/dates';
import { resolveAsset } from '../../config';
import { ui, radii, type, motion, petPair, photos, scrim, PET_COLOR_PAIRS } from '../../theme';
import { Button, Card, Chip, StepProgress, showToast, speciesIcon } from '../../components';

// Add pet = three small questions, one per screen (species → name + photo →
// optional details), then a calm success moment that suggests the next step
// while motivation is high. Editing lives in EditPetScreen. Stock photos only
// ever illustrate species choices and the success moment — never the user's
// pet (a photo-less pet shows its species glyph on its own tint).

const STEP_IN = FadeIn.duration(200);
const TOTAL_STEPS = 3;

const PET_TYPES = [
  { id: 'dog', label: 'Dog' },
  { id: 'cat', label: 'Cat' },
  { id: 'bird', label: 'Bird' },
  { id: 'rabbit', label: 'Rabbit' },
  { id: 'other', label: 'Other' },
];
const SPECIES_CARDS = [
  { id: 'dog', label: 'Dog', photo: photos.speciesDog },
  { id: 'cat', label: 'Cat', photo: photos.speciesCat },
];
const OTHER_TYPES = PET_TYPES.filter((t) => t.id !== 'dog' && t.id !== 'cat');

const BREED_SUGGESTIONS = {
  dog: ['Golden Retriever', 'Labrador', 'Mixed'],
  cat: ['Domestic Shorthair', 'Siamese', 'Mixed'],
  rabbit: ['Mini Lop', 'Netherland Dwarf', 'Mixed'],
  bird: ['Budgie', 'Cockatiel', 'Parrot'],
  other: [],
};

const GENDERS = [
  { id: 'male', label: 'Male', icon: 'gender-male' },
  { id: 'female', label: 'Female', icon: 'gender-female' },
];

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const blankForm = () => ({
  name: '',
  type: 'dog',
  breed: '',
  birthday: '',
  adoptedOn: '',
  age: '',
  weight: '',
  weightUnit: 'kg',
  gender: 'male',
  microchipped: false,
  color: PET_COLOR_PAIRS[0].bg,
  avatarUrl: null,
});

export default function AddPetScreen({ navigation }) {
  const { addPet } = useData();

  const [form, setForm] = useState(blankForm);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const [step, setStep] = useState(1);
  const [created, setCreated] = useState(null); // the saved pet → success view
  // Two taps in one frame ("Add" + "Skip for now", or a double tap) must never
  // create the pet twice.
  const { run, isBusy } = useInFlight();
  // The success view sits on a full-bleed photo: light status-bar glyphs over
  // a top scrim while it's focused (same treatment as Welcome).
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const saving = isBusy('create');
  const [showOther, setShowOther] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // Which date field the picker edits: null | 'birthday' | 'adoptedOn'.
  const [datePickerField, setDatePickerField] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Local uri of a picked photo whose upload failed — keep showing the chosen
  // image (never saved as avatarUrl) so the user can just tap again to retry.
  const [localPreview, setLocalPreview] = useState(null);

  const pair = petPair(form.color);
  const inFlow = !created;

  // Android back walks the steps backwards instead of abandoning the flow.
  useEffect(() => {
    if (!inFlow || step === 1) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep((s) => Math.max(1, s - 1));
      return true;
    });
    return () => sub.remove();
  }, [inFlow, step]);

  const pickAvatar = async () => {
    setUploading(true);
    const res = await pickAndUploadImage({ aspect: [1, 1] });
    setUploading(false);
    if (res.url) { set('avatarUrl', res.url); setLocalPreview(null); }
    else if (res.error === 'permission') showToast('Allow photo access to set a pet photo');
    else if (res.error) {
      if (res.uri) setLocalPreview(res.uri);
      showToast('Could not upload that image — try again');
    }
  };

  const pickerValue = datePickerField && form[datePickerField]
    ? parseDay(form[datePickerField])
    : new Date();

  const formatDate = (iso) => (iso ? fmtFull(parseDay(iso)) : null);

  const onDateChange = (event, selectedDate) => {
    const field = datePickerField;
    if (Platform.OS === 'android') setDatePickerField(null);
    if (event.type === 'dismissed' || !field) return;
    if (selectedDate) {
      const iso = selectedDate.toISOString().split('T')[0];
      set(field, iso);
    }
  };

  const buildData = (skipDetails = false) => ({
    name: form.name.trim(),
    type: form.type,
    breed: form.breed.trim(),
    birthday: skipDetails ? null : form.birthday || null,
    adoptedOn: skipDetails ? null : form.adoptedOn || null,
    age: skipDetails ? 0 : parseInt(form.age) || 0,
    weight: skipDetails ? '' : form.weight,
    weightUnit: form.weightUnit,
    gender: skipDetails ? null : form.gender,
    microchipped: skipDetails ? false : form.microchipped,
    color: form.color,
    avatarUrl: form.avatarUrl,
  });

  const requireName = () => {
    if (form.name.trim()) return true;
    showToast('Give your pet a name first');
    return false;
  };

  const handleCreate = async (skipDetails) => {
    if (!requireName()) { setStep(2); return; }
    const data = buildData(skipDetails);
    await run('create', async () => {
      if (data.adoptedOn) track('gotcha_day_set', {});
      const pet = await addPet(data);
      // addPet resolves undefined on failure without telling the user — say
      // so here, keeping everything they typed for the retry.
      if (pet) setCreated(pet);
      else showToast(`Couldn't add ${data.name}. Check your connection and try again.`);
    });
  };

  const restart = () => {
    setForm(blankForm());
    setLocalPreview(null);
    setShowOther(false);
    setCreated(null);
    setStep(1);
  };

  const goBack = () => {
    if (inFlow && step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const next = () => {
    if (step === 2 && !requireName()) return;
    setStep(step + 1);
  };

  // ── Building blocks ──

  const renderPhotoSlot = (size = 136) => {
    const photoUri = localPreview || (form.avatarUrl ? resolveAsset(form.avatarUrl) : null);
    return (
      <View style={styles.photoArea}>
        <Pressable
          onPress={pickAvatar}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={photoUri ? 'Change photo' : 'Add a photo'}
          style={[styles.photoRing, { width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, backgroundColor: pair.bg }]}
        >
          <View style={[styles.photo, { width: size, height: size, borderRadius: size / 2, backgroundColor: pair.bg }]}>
            {uploading ? (
              <ActivityIndicator color={pair.fg} />
            ) : photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.fill} />
            ) : (
              <MaterialCommunityIcons name={speciesIcon(form.type)} size={Math.round(size * 0.42)} color={pair.fg} />
            )}
          </View>
          <View style={styles.cameraBadge}>
            <MaterialCommunityIcons name="camera" size={18} color={ui.onAccent} />
          </View>
        </Pressable>
        <Text style={styles.photoHint}>{photoUri ? 'Change photo' : 'Add a photo'}</Text>
      </View>
    );
  };

  const renderName = () => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        style={[styles.input, styles.nameInput, nameFocused && styles.inputFocused]}
        placeholder="e.g. Luna"
        placeholderTextColor={ui.subtle}
        value={form.name}
        onChangeText={(v) => set('name', v)}
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
        autoFocus={inFlow && !form.name}
        autoCapitalize="words"
        returnKeyType="next"
        accessibilityLabel="Pet name"
      />
    </View>
  );

  const renderBreed = () => {
    const suggestions = BREED_SUGGESTIONS[form.type] || [];
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Breed · optional</Text>
        {suggestions.length > 0 && (
          <View style={styles.chipWrap}>
            {suggestions.map((b) => (
              <Chip
                key={b}
                label={b}
                active={form.breed === b}
                accessibilityRole="radio"
                onPress={() => set('breed', form.breed === b ? '' : b)}
              />
            ))}
          </View>
        )}
        <TextInput
          style={[styles.input, suggestions.length > 0 && { marginTop: 10 }]}
          placeholder={suggestions.length ? 'Or type a breed' : 'e.g. Holland Lop'}
          placeholderTextColor={ui.subtle}
          value={form.breed}
          onChangeText={(v) => set('breed', v)}
          accessibilityLabel="Breed"
        />
      </View>
    );
  };

  const renderColors = () => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Their color</Text>
      <View style={styles.swatchRow}>
        {PET_COLOR_PAIRS.map((c, i) => {
          const on = form.color === c.bg;
          return (
            <Pressable
              key={c.bg}
              style={[styles.swatchRing, on && { borderColor: ui.accent }]}
              onPress={() => set('color', c.bg)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Color ${i + 1}`}
            >
              <View style={[styles.swatch, { backgroundColor: c.bg }]}>
                {on && <MaterialCommunityIcons name="check" size={18} color={c.fg} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderDetails = () => (
    <>
      <View style={styles.row2}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Age (years)</Text>
          <TextInput
            style={styles.input}
            placeholder="2"
            placeholderTextColor={ui.subtle}
            value={form.age}
            onChangeText={(v) => set('age', v)}
            keyboardType="number-pad"
            accessibilityLabel="Age in years"
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Birthday</Text>
          <Pressable
            style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: ui.pressTint }]}
            onPress={() => setDatePickerField('birthday')}
            accessibilityRole="button"
            accessibilityLabel={`Birthday, ${form.birthday ? formatDate(form.birthday) : 'not set'}`}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={17} color={ui.accent} />
            <Text style={[styles.dateBtnText, !form.birthday && { color: ui.subtle }]} numberOfLines={1}>
              {form.birthday ? formatDate(form.birthday) : 'Select date'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Gotcha day (adoption date) — drives care anniversaries */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Gotcha day</Text>
        <Pressable
          style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: ui.pressTint }]}
          onPress={() => setDatePickerField('adoptedOn')}
          accessibilityRole="button"
          accessibilityLabel={`Gotcha day, ${form.adoptedOn ? formatDate(form.adoptedOn) : 'not set'}`}
        >
          <MaterialCommunityIcons name="heart-outline" size={17} color={ui.accent} />
          <Text style={[styles.dateBtnText, !form.adoptedOn && { color: ui.subtle }]} numberOfLines={1}>
            {form.adoptedOn ? formatDate(form.adoptedOn) : 'The day they came home'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.row2}>
        <View style={[styles.field, { flex: 2 }]}>
          <Text style={styles.fieldLabel}>Weight</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 28"
            placeholderTextColor={ui.subtle}
            value={form.weight}
            onChangeText={(v) => set('weight', v)}
            keyboardType="decimal-pad"
            accessibilityLabel={`Weight in ${form.weightUnit}`}
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Unit</Text>
          <Pressable
            style={({ pressed }) => [styles.dateBtn, { justifyContent: 'center' }, pressed && { backgroundColor: ui.pressTint }]}
            onPress={() => set('weightUnit', form.weightUnit === 'kg' ? 'lbs' : 'kg')}
            accessibilityRole="button"
            accessibilityLabel={`Unit ${form.weightUnit}, tap to switch`}
          >
            <Text style={styles.unitText}>{form.weightUnit}</Text>
            <MaterialCommunityIcons name="swap-horizontal" size={15} color={ui.accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Gender</Text>
        <View style={styles.genderRow}>
          {GENDERS.map((g) => {
            const on = form.gender === g.id;
            return (
              <Pressable
                key={g.id}
                style={[styles.genderChip, on && styles.chipOn]}
                onPress={() => set('gender', g.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <MaterialCommunityIcons name={g.icon} size={16} color={on ? ui.background : ui.ink} />
                <Text style={[styles.genderText, on && { color: ui.background }]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <View style={styles.switchIcon}>
            <MaterialCommunityIcons name="chip" size={18} color={ui.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Microchipped</Text>
            <Text style={styles.switchSub}>Is your pet microchipped?</Text>
          </View>
        </View>
        <Switch
          value={form.microchipped}
          onValueChange={(v) => set('microchipped', v)}
          trackColor={{ false: ui.track, true: ui.accentTint }}
          thumbColor={form.microchipped ? ui.accent : ui.faint}
          activeThumbColor={ui.accent}
          accessibilityLabel="Microchipped"
        />
      </View>
    </>
  );

  // ── Steps ──

  const renderSpeciesStep = () => (
    <View style={{ gap: 16 }}>
      {SPECIES_CARDS.map((s) => {
        const on = form.type === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => { set('type', s.id); setShowOther(false); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={s.label}
            style={({ pressed }) => [
              styles.speciesCard,
              on ? styles.speciesCardOn : null,
              pressed && { transform: [{ scale: motion.pressScale }] },
            ]}
          >
            <Image source={s.photo} style={styles.fill} resizeMode="cover" />
            <View style={styles.speciesLabel}>
              <MaterialCommunityIcons name={speciesIcon(s.id)} size={20} color={ui.accent} />
              <Text style={styles.speciesLabelText}>{s.label}</Text>
            </View>
            {on && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check" size={20} color={ui.onAccent} />
              </View>
            )}
          </Pressable>
        );
      })}

      <Card>
        <Pressable
          onPress={() => setShowOther((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showOther }}
          style={({ pressed }) => [styles.otherRow, pressed && { backgroundColor: ui.pressTint }]}
        >
          <View style={[styles.iconChip, { backgroundColor: PET_COLOR_PAIRS[4].bg }]}>
            <MaterialCommunityIcons name="rabbit" size={20} color={PET_COLOR_PAIRS[4].fg} />
          </View>
          <Text style={styles.otherText}>Rabbit, bird or other</Text>
          <MaterialCommunityIcons name={showOther ? 'chevron-up' : 'chevron-down'} size={22} color={ui.faint} />
        </Pressable>
        {showOther && (
          <Animated.View entering={STEP_IN} style={styles.otherChips}>
            {OTHER_TYPES.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                active={form.type === t.id}
                accessibilityRole="radio"
                onPress={() => set('type', t.id)}
              />
            ))}
          </Animated.View>
        )}
      </Card>
    </View>
  );

  const renderNameStep = () => (
    <View>
      {renderPhotoSlot()}
      {renderName()}
      {renderBreed()}
      {renderColors()}
      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={20} color={ui.subtle} />
        <Text style={styles.noteText}>
          Birthday, weight and vet details can wait. Nothing here is permanent.
        </Text>
      </View>
    </View>
  );

  const STEP_COPY = {
    1: { title: 'Who are we caring for?', sub: 'Pick one. You can add more pets later.' },
    2: { title: "What's their name?", sub: 'A photo helps you spot them at a glance.' },
    3: {
      title: 'A few optional details',
      sub: `Add what you know now. ${form.name.trim() || 'Their'}${form.name.trim() ? "'s" : ''} profile works without them.`,
    },
  };

  // ── Success ──

  if (created) {
    const name = created.name;
    return (
      <View style={styles.safe}>
        <Image
          source={photos.successHug}
          style={styles.successPhoto}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          importantForAccessibility="no"
        />
        <LinearGradient
          colors={scrim.top}
          pointerEvents="none"
          style={[styles.successScrim, { height: insets.top + 60 }]}
        />
        {isFocused && <StatusBar style="light" />}
        <View style={styles.successSheet}>
          <View style={styles.successBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="check" size={34} color={ui.onAccent} />
          </View>
          <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={STEP_IN} style={{ gap: 6, alignItems: 'center' }}>
              <Text style={styles.successTitle} accessibilityRole="header">{name} is all set!</Text>
              <Text style={styles.successSub}>We'll nudge you before anything is due.</Text>
            </Animated.View>

            <Text style={[styles.fieldLabel, { marginTop: 22 }]}>Two quick wins next</Text>
            <Card>
              <QuickWin
                icon="needle"
                pairIndex={0}
                title="Add vaccine records"
                sub="~2 min · keeps reminders accurate"
                onPress={() => navigation.replace('VaccinationTracker', { petId: created.id })}
              />
              <QuickWin
                icon="bowl-mix"
                pairIndex={2}
                title="Set up daily care"
                sub="~1 min · meals, meds and walks"
                onPress={() => navigation.replace('PetProfile', { petId: created.id })}
                last
              />
            </Card>

            <View style={{ gap: 6, marginTop: 24 }}>
              <Button
                label={`Go to ${name}'s profile`}
                onPress={() => navigation.replace('PetProfile', { petId: created.id })}
                style={styles.bigBtn}
              />
              <Pressable onPress={restart} style={styles.textLink} hitSlop={HIT} accessibilityRole="button">
                <Text style={styles.textLinkText}>Add another pet</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Flow ──

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: ui.pressTint }]}
              onPress={goBack}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={inFlow && step > 1 ? 'Previous step' : 'Back'}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color={ui.ink} />
            </Pressable>
            <Text style={styles.stepLabel} numberOfLines={1}>
              Step {step} of {TOTAL_STEPS}
            </Text>
            <View style={{ width: 42 }} />
          </View>
          {inFlow && <StepProgress done={step} total={TOTAL_STEPS} style={{ marginTop: 14 }} />}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View key={step} entering={STEP_IN}>
              <Text style={styles.stepTitle} accessibilityRole="header">{STEP_COPY[step].title}</Text>
              <Text style={styles.stepSub}>{STEP_COPY[step].sub}</Text>
              {step === 1 && renderSpeciesStep()}
              {step === 2 && renderNameStep()}
              {step === 3 && renderDetails()}
          </Animated.View>
        </ScrollView>

        {/* Primary action pinned in the thumb zone, same place every step. */}
        <View style={styles.footer}>
          {step < TOTAL_STEPS ? (
            <Button label="Continue" onPress={next} disabled={uploading} style={styles.bigBtn} />
          ) : (
            <>
              <Button
                label={saving ? 'Adding…' : `Add ${form.name.trim() || 'pet'}`}
                icon="paw"
                onPress={() => handleCreate(false)}
                disabled={uploading || saving}
                style={styles.bigBtn}
              />
              <Pressable
                onPress={() => handleCreate(true)}
                disabled={saving}
                style={styles.textLink}
                hitSlop={HIT}
                accessibilityRole="button"
              >
                <Text style={styles.textLinkText}>Skip for now</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Android date picker */}
      {!!datePickerField && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      {/* iOS date picker modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={!!datePickerField} transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.iosPickerHeader}>
                <Pressable onPress={() => setDatePickerField(null)} hitSlop={HIT}>
                  <Text style={styles.iosPickerCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.iosPickerTitle}>{datePickerField === 'adoptedOn' ? 'Gotcha day' : 'Birthday'}</Text>
                <Pressable onPress={() => setDatePickerField(null)} hitSlop={HIT}>
                  <Text style={styles.iosPickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={onDateChange}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function QuickWin({ icon, pairIndex, title, sub, onPress, last }) {
  const p = PET_COLOR_PAIRS[pairIndex];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      style={({ pressed }) => [
        styles.winRow,
        !last && styles.winDivider,
        pressed && { backgroundColor: ui.pressTint },
      ]}
    >
      <View style={[styles.iconChip, { backgroundColor: p.bg }]}>
        <MaterialCommunityIcons name={icon} size={20} color={p.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.winTitle}>{title}</Text>
        <Text style={styles.winSub}>{sub}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={ui.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  fill: { width: '100%', height: '100%' },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
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
  stepLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.sub, flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24 },
  stepTitle: { ...type.screenTitle, color: ui.ink },
  stepSub: { ...type.body, color: ui.sub, marginTop: 6, marginBottom: 20 },
  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 16, gap: 4, backgroundColor: ui.background },
  bigBtn: { paddingVertical: 16, borderRadius: 16 },
  textLink: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  textLinkText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.accent },

  // Species
  speciesCard: {
    height: 206,
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.track,
  },
  speciesCardOn: { borderWidth: 3, borderColor: ui.accent },
  speciesLabel: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ui.surface,
    borderRadius: 999,
    paddingVertical: 9,
    paddingLeft: 12,
    paddingRight: 16,
  },
  speciesLabelText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: ui.ink },
  checkBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ui.accent,
    borderWidth: 2.5,
    borderColor: ui.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56 },
  otherText: { ...type.rowTitle, fontSize: 15, color: ui.ink, flex: 1 },
  otherChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 14 },
  iconChip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Photo
  photoArea: { alignItems: 'center', marginBottom: 22 },
  photoRing: { alignItems: 'center', justifyContent: 'center' },
  photo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3, borderColor: ui.surface },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: ui.background,
  },
  photoHint: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: ui.accent, marginTop: 10 },

  // Fields
  field: { marginBottom: 20 },
  fieldLabel: { ...type.sectionLabel, color: ui.subtle, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 49,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  nameInput: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 17, minHeight: 54 },
  inputFocused: { borderWidth: 2, borderColor: ui.accent },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipOn: { backgroundColor: ui.ink, borderColor: ui.ink },
  row2: { flexDirection: 'row', gap: 12 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    padding: 14,
    minHeight: 49,
  },
  dateBtnText: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: ui.ink },
  unitText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.ink },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
  },
  genderText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.ink },
  swatchRow: { flexDirection: 'row', gap: 12 },
  swatchRing: { borderWidth: 2, borderColor: 'transparent', borderRadius: 26, padding: 2 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ui.track,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
  },
  noteText: { ...type.body, fontSize: 13, lineHeight: 19, color: ui.sub, flex: 1 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 8,
  },
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  switchIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ui.accentTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchLabel: { ...type.rowTitle, color: ui.ink },
  switchSub: { ...type.secondary, color: ui.sub, marginTop: 1 },

  // Success
  successPhoto: { width: '100%', height: '45%' },
  successScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  successSheet: {
    flex: 1,
    marginTop: -28,
    backgroundColor: ui.background,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
  },
  successBadge: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    zIndex: 1,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ui.success,
    borderWidth: 5,
    borderColor: ui.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successScroll: { paddingHorizontal: 24, paddingTop: 50, paddingBottom: 28 },
  successTitle: { ...type.screenTitle, fontSize: 28, lineHeight: 34, color: ui.ink, textAlign: 'center' },
  successSub: { ...type.body, fontSize: 15, color: ui.sub, textAlign: 'center' },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14, minHeight: 64 },
  winDivider: { borderBottomWidth: 1, borderBottomColor: ui.hairline },
  winTitle: { ...type.rowTitle, fontSize: 15, color: ui.ink },
  winSub: { ...type.secondary, color: ui.sub, marginTop: 1 },

  // iOS date picker
  iosPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: ui.overlay },
  iosPickerSheet: {
    backgroundColor: ui.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: ui.faint,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.hairline,
  },
  iosPickerTitle: { ...type.cardTitleSm, color: ui.ink },
  iosPickerCancel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: ui.sub },
  iosPickerDone: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.accent },
});
