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
import { Button } from '../../components';
import SocialAuthButtons from '../../components/SocialAuthButtons';

export default function SignupScreen({ navigation }) {
  const { signup, error, isLoading, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focused, setFocused] = useState('');
  const [localError, setLocalError] = useState(null);

  // Editing any field clears both the local validation error and the auth error.
  const onChange = (setter) => (value) => {
    setter(value);
    if (localError) setLocalError(null);
    if (error) clearError();
  };

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPwd) {
      setLocalError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPwd) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    setLocalError(null);
    await signup({ name: name.trim(), email: email.trim(), password });
    // On failure useAuth().error is set and rendered inline below.
  };

  const displayError = localError || error;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>

          <Text style={[type.screenTitle, styles.title]}>Create your account</Text>
          <Text style={styles.subtitle}>Your pack's records, safe in one place.</Text>

          <View style={styles.form}>
            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Your name</Text>
              <TextInput
                style={[styles.input, focused === 'name' && styles.inputFocused]}
                placeholder="e.g. Ahmed"
                placeholderTextColor={ui.faint}
                value={name}
                onChangeText={onChange(setName)}
                autoCapitalize="words"
                autoCorrect={false}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused('')}
                textContentType="name"
                autoComplete="name"
              />
            </View>

            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Email</Text>
              <TextInput
                style={[styles.input, focused === 'email' && styles.inputFocused]}
                placeholder="you@example.com"
                placeholderTextColor={ui.faint}
                value={email}
                onChangeText={onChange(setEmail)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused('')}
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>

            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Password</Text>
              <View style={[styles.inputRow, focused === 'pwd' && styles.inputFocused]}>
                <TextInput
                  style={styles.inputInner}
                  placeholder="6+ characters"
                  placeholderTextColor={ui.faint}
                  value={password}
                  onChangeText={onChange(setPassword)}
                  secureTextEntry={!showPwd}
                  onFocus={() => setFocused('pwd')}
                  onBlur={() => setFocused('')}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
                <Pressable
                  onPress={() => setShowPwd(!showPwd)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons
                    name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={ui.faint}
                  />
                </Pressable>
              </View>
            </View>

            <View>
              <Text style={[type.sectionLabel, styles.fieldLabel]}>Confirm password</Text>
              <TextInput
                style={[styles.input, focused === 'confirm' && styles.inputFocused]}
                placeholder="Repeat password"
                placeholderTextColor={ui.faint}
                value={confirmPwd}
                onChangeText={onChange(setConfirmPwd)}
                secureTextEntry={!showPwd}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused('')}
                textContentType="newPassword"
              />
            </View>
          </View>

          {displayError ? <Text style={styles.errorText}>{displayError}</Text> : null}

          <Button
            label={isLoading ? 'Creating account…' : 'Create account'}
            onPress={handleSignup}
            disabled={isLoading}
            style={styles.submitBtn}
          />

          <SocialAuthButtons />

          <Pressable
            style={({ pressed }) => [styles.switchLink, pressed && { opacity: 0.7 }]}
            onPress={() => {
              if (error) clearError();
              navigation.navigate('Login');
            }}
            hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
          >
            <Text style={styles.switchLinkText}>Already have an account? Log in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 28, paddingBottom: 40 },
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
  title: { color: ui.ink, marginTop: 26, marginBottom: 6 },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: ui.sub,
    marginBottom: 28,
  },
  form: { gap: 16 },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.background,
    borderRadius: radii.control,
    borderCurve: 'continuous',
    paddingRight: 14,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: ui.ink,
  },
  inputFocused: { borderColor: ui.accent },
  errorText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: ui.danger,
    marginTop: 14,
  },
  submitBtn: { marginTop: 28, paddingVertical: 16 },
  switchLink: { alignItems: 'center', paddingVertical: 14 },
  switchLinkText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: ui.accent,
  },
});
