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
import { useAuth } from '../../context/AuthContext';
import { ui, type, radii } from '../../theme';
import { Button, showToast } from '../../components';

// Account details (Profile → Edit). PATCH /users/me only accepts name / bio /
// avatar_url / timezone, so name is the one editable field here; email is
// rendered read-only. The prototype's "Change password" row is omitted — the
// backend has no password-change endpoint yet.

export default function AccountDetailsScreen({ navigation }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await updateUser({ name: trimmed });
    setSaving(false);
    showToast('Saved');
    navigation.goBack();
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
            <Text style={styles.headerTitle}>Account details</Text>
          </View>

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={ui.faint}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                autoComplete="name"
              />
            </View>

            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Email</Text>
              <View style={[styles.input, styles.inputReadOnly]}>
                <Text style={styles.readOnlyValue}>{user?.email}</Text>
                <MaterialCommunityIcons name="lock-outline" size={16} color={ui.faint} />
              </View>
              <Text style={styles.readOnlyHint}>Contact support to change your email.</Text>
            </View>

            <Button label="Save changes" onPress={handleSave} disabled={!canSave} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingTop: 12, paddingHorizontal: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
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
  avatarWrap: { alignItems: 'center', marginBottom: 26 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 34, color: ui.accent },
  form: { gap: 20 },
  fieldLabel: { color: ui.subtle, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  inputReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readOnlyValue: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.sub,
  },
  readOnlyHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: ui.subtle,
    marginTop: 7,
  },
});
