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
import { ui, type, radii } from '../../theme';
import { Card, ListRow, Button, showToast } from '../../components';

// Help & support (Profile → Help & support). Static guide rows for now plus a
// contact form. The whole screen sits inside KeyboardAvoidingView + ScrollView
// (keyboardShouldPersistTaps) so the send button is never trapped behind the
// keyboard — a top competitor 1★ complaint.

const GUIDES = [
  { icon: 'rocket-launch-outline', title: 'Getting started' },
  { icon: 'bell-outline', title: 'Reminders & notifications' },
  { icon: 'account-group-outline', title: 'Sharing with family & your vet' },
];

export default function SupportScreen({ navigation }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  const canSend = message.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await post('/support/messages', { message: message.trim() });
      setMessage('');
      showToast("Sent — we'll reply within 2 business days");
      navigation.goBack();
    } catch (e) {
      showToast(e?.message || 'Could not send — try again');
      setSending(false);
    }
  };

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
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.goBack()}
            >
              <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
            </Pressable>
            <Text style={styles.headerTitle}>Help & support</Text>
          </View>

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

          <Text style={[type.sectionLabel, styles.sectionLabel]}>Contact us</Text>
          <Card style={styles.contactCard}>
            <TextInput
              style={[styles.messageInput, focused && styles.inputFocused]}
              placeholder="Tell us what's going on — the more detail, the faster we can help."
              placeholderTextColor={ui.faint}
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
            <Text style={styles.caption}>We reply within 2 business days.</Text>
          </Card>
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
