import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { post } from '../../services/api';
import { useTranslation } from '../../i18n';
import { ui, type } from '../../theme';
import { Card, ListRow, Button, Chip, showToast, FormScrollView, ScreenHeader } from '../../components';
import { GUIDES } from './guides';

// Help & feedback (Profile → Help & feedback; other screens can preselect a
// category with the `category` param). A private message form first, then
// the help guides (guides.js, opened in GuideScreen). Messages are stored
// on the backend and forwarded to the team's inbox, never posted anywhere,
// and deliberately unrelated to the store rating prompt (services/storeReview).
// The whole screen sits in a FormScrollView (keyboard-avoiding, taps pass
// through) so the send button is never trapped behind the keyboard — a top
// competitor 1★ complaint.

// Optional; ids match SupportMessage::CATEGORIES on the backend. Labels and
// placeholders are `support.category.<id>` / `support.placeholder.<id>`.
// `expectsReply` drives both the caption and the sent toast: problems and
// questions get the reply promise, feedback and ideas don't need an answer.
const CATEGORIES = [
  { id: 'feedback', expectsReply: false },
  { id: 'problem', expectsReply: true },
  { id: 'idea', expectsReply: false },
  { id: 'question', expectsReply: true },
];
// No chip picked: a neutral prompt, and the reply promise (it may need one).
const NO_CATEGORY = { id: 'none', expectsReply: true };

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
  const { t } = useTranslation();

  const canSend = message.trim().length > 0 && !sending;
  const picked = CATEGORIES.find((c) => c.id === category) ?? NO_CATEGORY;
  const { expectsReply } = picked;
  const placeholder = t(`support.placeholder.${picked.id}`);

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
      showToast(expectsReply ? t('support.sentReply') : t('support.sentNote'));
      navigation.goBack();
    } catch (e) {
      showToast(e?.message || t('support.sendFailed'));
      setSending(false);
    }
  };

  const guides = (
    <>
      <Text style={[type.sectionLabel, styles.sectionLabel]}>{t('support.guides')}</Text>
      <Card style={styles.sectionCard}>
        {GUIDES.map((guide, i) => (
          <ListRow
            key={guide.id}
            icon={guide.icon}
            title={t(`support.guide.${guide.id}`)}
            chevron
            onPress={() => navigation.navigate('Guide', { id: guide.id })}
            last={i === GUIDES.length - 1}
          />
        ))}
      </Card>
    </>
  );

  const form = (
    <>
      <Text style={[type.sectionLabel, styles.sectionLabel]}>{t('support.messageTeam')}</Text>
      <Card style={styles.contactCard}>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip
              accessibilityRole="radio"
              key={c.id}
              label={t(`support.category.${c.id}`)}
              active={category === c.id}
              onPress={() => setCategory(category === c.id ? null : c.id)}
            />
          ))}
        </View>
        <TextInput
          style={[styles.messageInput, focused && styles.inputFocused]}
          placeholder={placeholder}
          placeholderTextColor={ui.placeholder}
          accessibilityLabel={t('support.messageA11y')}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Button
          label={sending ? t('support.sending') : t('support.send')}
          onPress={handleSend}
          disabled={!canSend}
        />
        <Text style={styles.caption}>{expectsReply ? t('support.captionReply') : t('support.captionNote')}</Text>
      </Card>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t('support.title')} onBack={() => navigation.goBack()} />

        {form}
        {guides}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 }, // ScreenHeader pads the top
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
