import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { post } from '../../services/api';
import { ui, type, radii, motion } from '../../theme';
import { Card, ListRow, Button, Chip, showToast } from '../../components';

// Help & support (Profile → Help & support, or Profile → Send feedback with
// the Feedback chip preselected). Static guide rows for now plus a private
// message form: stored on the backend and forwarded to the team's inbox,
// never posted anywhere, and deliberately unrelated to the store rating
// prompt (services/storeReview). The whole screen sits inside
// KeyboardAvoidingView + ScrollView (keyboardShouldPersistTaps) so the send
// button is never trapped behind the keyboard — a top competitor 1★ complaint.

const GUIDES = [
  { icon: 'rocket-launch-outline', title: 'Getting started' },
  { icon: 'bell-outline', title: 'Reminders & notifications' },
  { icon: 'account-group-outline', title: 'Sharing with family & your vet' },
];

// Optional; matches SupportMessage::CATEGORIES on the backend.
const CATEGORIES = [
  { id: 'feedback', label: 'Feedback', placeholder: "What's working, and what isn't? Every note is read." },
  { id: 'problem', label: 'Problem', placeholder: "Tell us what's going on — the more detail, the faster we can help." },
  { id: 'idea', label: 'Idea', placeholder: 'What would make PawPawCare better for you and your pets?' },
  { id: 'question', label: 'Question', placeholder: 'Ask us anything about the app.' },
];
const DEFAULT_PLACEHOLDER = CATEGORIES.find((c) => c.id === 'problem').placeholder;

// The installed app's version, for triage. Guarded like purchases.js: an
// OTA update on a build without expo-application just sends none.
let Application = null;
try {
  // eslint-disable-next-line global-require
  Application = require('expo-application');
} catch (e) {
  Application = null;
}

function appVersion() {
  const version = Application?.nativeApplicationVersion;
  if (!version) return null;
  const build = Application?.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}

export default function SupportScreen({ navigation, route }) {
  const initial = CATEGORIES.some((c) => c.id === route?.params?.category) ? route.params.category : null;
  // Opened from Profile → Send feedback: lead with the form, titled to match.
  const feedbackFirst = initial === 'feedback';
  const [category, setCategory] = useState(initial);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  const canSend = message.trim().length > 0 && !sending;
  const placeholder = CATEGORIES.find((c) => c.id === category)?.placeholder || DEFAULT_PLACEHOLDER;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await post('/support/messages', {
        message: message.trim(),
        category,
        app_version: appVersion(),
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null,
      });
      setMessage('');
      showToast(category === 'feedback' ? 'Thanks — we read every note' : "Sent — we'll reply within 2 business days");
      navigation.goBack();
    } catch (e) {
      showToast(e?.message || 'Could not send — try again');
      setSending(false);
    }
  };

  const guides = (
    <>
      <Text style={[type.sectionLabel, styles.sectionLabel]}>Guides</Text>
      <Card style={styles.sectionCard}>
        {GUIDES.map((guide, i) => (
          <ListRow
            key={guide.title}
            icon={guide.icon}
            title={guide.title}
            chevron
            onPress={() => showToast('Guide coming soon')}
            last={i === GUIDES.length - 1}
          />
        ))}
      </Card>
    </>
  );

  const form = (
    <>
      <Text style={[type.sectionLabel, styles.sectionLabel]}>Send feedback or get help</Text>
      <Card style={styles.contactCard}>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip
              accessibilityRole="radio"
              key={c.id}
              label={c.label}
              active={category === c.id}
              onPress={() => setCategory(category === c.id ? null : c.id)}
            />
          ))}
        </View>
        <TextInput
          style={[styles.messageInput, focused && styles.inputFocused]}
          placeholder={placeholder}
          placeholderTextColor={ui.faint}
          accessibilityLabel="Your message"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Button
          label={sending ? 'Sending…' : 'Send message'}
          onPress={handleSend}
          disabled={!canSend}
        />
        <Text style={styles.caption}>
          Only our team reads this — it's never posted publicly. We reply within 2 business days.
        </Text>
      </Card>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
            </Pressable>
            <Text style={styles.headerTitle} accessibilityRole="header">
              {feedbackFirst ? 'Send feedback' : 'Help & support'}
            </Text>
          </View>

          {feedbackFirst ? form : guides}
          {feedbackFirst ? guides : form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 26,
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
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    letterSpacing: -0.3,
    color: ui.ink,
  },
  sectionLabel: { color: ui.subtle, marginHorizontal: 24, marginBottom: 8 },
  sectionCard: { marginHorizontal: 24, marginBottom: 22 },
  contactCard: { marginHorizontal: 24, marginBottom: 22, padding: 18, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  messageInput: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
    color: ui.ink,
  },
  inputFocused: { borderColor: ui.accent },
  caption: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: ui.subtle,
    textAlign: 'center',
  },
});
