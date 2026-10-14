import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { post } from '../../services/api';
import { ui, type } from '../../theme';
import { Card, ListRow, Button, Chip, showToast, FormScrollView, ScreenHeader } from '../../components';

// Help & feedback (Profile → Help & feedback; other screens can preselect a
// category with the `category` param). A private message form first, then
// placeholder guide rows (real guides are a follow-up). Messages are stored
// on the backend and forwarded to the team's inbox, never posted anywhere,
// and deliberately unrelated to the store rating prompt (services/storeReview).
// The whole screen sits in a FormScrollView (keyboard-avoiding, taps pass
// through) so the send button is never trapped behind the keyboard — a top
// competitor 1★ complaint.

// Placeholders until the real guides exist (CHW-175): shown as "Soon", not
// tappable, so they don't read as broken links.
const GUIDES = [
  { icon: 'rocket-launch-outline', title: 'Getting started' },
  { icon: 'bell-outline', title: 'Reminders & notifications' },
  { icon: 'account-group-outline', title: 'Sharing with family & your vet' },
];

// Optional; ids match SupportMessage::CATEGORIES on the backend.
// `expectsReply` drives both the caption and the sent toast: problems and
// questions get the reply promise, feedback and ideas don't need an answer.
const CATEGORIES = [
  { id: 'feedback', label: 'Feedback', expectsReply: false, placeholder: "What's working, and what isn't? Every note is read." },
  { id: 'problem', label: 'Problem', expectsReply: true, placeholder: "Tell us what's going on — the more detail, the faster we can help." },
  { id: 'idea', label: 'Idea', expectsReply: false, placeholder: 'What would make PawPawCare better for you and your pets?' },
  { id: 'question', label: 'Question', expectsReply: true, placeholder: 'Ask us anything about the app.' },
];
// No chip picked: a neutral prompt, and the reply promise (it may need one).
const NO_CATEGORY = {
  expectsReply: true,
  placeholder: 'How can we help? Ask a question, report a problem or share an idea.',
};
const PRIVATE = "Only our team reads this, and it's never posted publicly.";
const REPLY_CAPTION = `${PRIVATE} We reply within 2 business days.`;
const NOTE_CAPTION = `${PRIVATE} We read every note.`;

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
  const [category, setCategory] = useState(initial);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  const canSend = message.trim().length > 0 && !sending;
  const { expectsReply, placeholder } = CATEGORIES.find((c) => c.id === category) ?? NO_CATEGORY;

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
      showToast(expectsReply ? "Sent — we'll reply within 2 business days" : 'Thanks — we read every note');
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
            value="Soon"
            last={i === GUIDES.length - 1}
          />
        ))}
      </Card>
    </>
  );

  const form = (
    <>
      <Text style={[type.sectionLabel, styles.sectionLabel]}>Message our team</Text>
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
          placeholderTextColor={ui.placeholder}
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
        <Text style={styles.caption}>{expectsReply ? REPLY_CAPTION : NOTE_CAPTION}</Text>
      </Card>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title="Help & feedback" onBack={() => navigation.goBack()} style={styles.header} />

        {form}
        {guides}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 0 }, // the scroll already pads; ScreenHeader adds the rest
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingBottom: 32 },
  sectionLabel: { color: ui.subtle, marginHorizontal: 24, marginBottom: 8 },
  sectionCard: { marginHorizontal: 24, marginBottom: 22 },
  contactCard: { marginHorizontal: 24, marginBottom: 22, padding: 18, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  messageInput: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: ui.inputBorder,
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
  // Focus = darker AND thicker (accent vs the tan outline is only 1.9:1).
  inputFocused: { borderColor: ui.accent, borderWidth: 2 },
  caption: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: ui.subtle,
    textAlign: 'center',
  },
});
