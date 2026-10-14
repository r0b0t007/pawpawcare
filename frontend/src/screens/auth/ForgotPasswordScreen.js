import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { post } from '../../services/api';
import { ui, type, radii, motion } from '../../theme';
import { Button, showToast, FormScrollView } from '../../components';

// Code-based password reset. Step 1 asks for the email; step 2 confirms a
// 6-digit code was sent and collects code + new password. The backend always
// answers 200 to the send, so step 2 shows for any address — no enumeration.

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focused, setFocused] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Editing any field clears the inline error.
  const onChange = (setter) => (value) => {
    setter(value);
    if (error) setError(null);
  };

  const sendCode = async ({ again = false } = {}) => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await post('/auth/forgot-password', { email: trimmed }, { skipAuth: true });
      if (again) {
        showToast('New code sent');
      } else {
        setStep('code');
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong — try again.');
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Your new password needs at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setResetting(true);
    try {
      await post(
        '/auth/reset-password',
        { email: email.trim(), code: code.trim(), password },
        { skipAuth: true },
      );
      showToast('Password updated — log in');
      navigation.navigate('Login');
    } catch (e) {
      setError(e?.message || 'Something went wrong — try again.');
      setResetting(false);
    }
  };

  const handleBack = () => {
    if (step === 'code') {
      setError(null);
      setStep('email');
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: motion.pressOpacity }]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>

        {step === 'email' ? (
          <>
            <Text style={[type.screenTitle, styles.title]}>Reset your password</Text>
            <Text style={styles.subtitle}>
              Enter your account email and we'll send you a 6-digit code.
            </Text>

            <View style={styles.form}>
              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>Email</Text>
                <TextInput
                  style={[styles.input, focused === 'email' && styles.inputFocused]}
                  placeholder="you@example.com"
                  placeholderTextColor={ui.subtle}
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
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              label={sending ? 'Sending…' : 'Send code'}
              onPress={() => sendCode()}
              disabled={sending}
              style={styles.submitBtn}
            />
          </>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="email-check-outline" size={30} color={ui.accent} />
            </View>
            <Text style={[type.screenTitle, styles.title, { marginTop: 18 }]}>
              Check your inbox
            </Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to {email.trim()}. It's valid for 30 minutes.
            </Text>

            <View style={styles.form}>
              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>6-digit code</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    focused === 'code' && styles.inputFocused,
                  ]}
                  placeholder="123456"
                  placeholderTextColor={ui.subtle}
                  value={code}
                  onChangeText={onChange(setCode)}
                  keyboardType="number-pad"
                  maxLength={6}
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused('')}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                />
              </View>

              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>New password</Text>
                <View style={[styles.inputRow, focused === 'password' && styles.inputFocused]}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="At least 8 characters"
                    placeholderTextColor={ui.subtle}
                    value={password}
                    onChangeText={onChange(setPassword)}
                    secureTextEntry={!showPwd}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused('')}
                    textContentType="newPassword"
                    autoComplete="new-password"
                  />
                  <Pressable
                    onPress={() => setShowPwd(!showPwd)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                  >
                    <MaterialCommunityIcons
                      name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={ui.subtle}
                    />
                  </Pressable>
                </View>
              </View>

              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>Confirm password</Text>
                <TextInput
                  style={[styles.input, focused === 'confirm' && styles.inputFocused]}
                  placeholder="Same password again"
                  placeholderTextColor={ui.subtle}
                  value={confirm}
                  onChangeText={onChange(setConfirm)}
                  secureTextEntry={!showPwd}
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused('')}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              label={resetting ? 'Updating…' : 'Reset password'}
              onPress={handleReset}
              disabled={resetting}
              style={styles.submitBtn}
            />

            <Pressable accessibilityRole="button"
              style={({ pressed }) => [styles.resendLink, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => sendCode({ again: true })}
              disabled={sending}
              hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
            >
              <Text style={[styles.resendLinkText, sending && { opacity: 0.5 }]}>
                {sending ? 'Sending…' : "Didn't get it? Send again"}
              </Text>
            </Pressable>
          </>
        )}
      </FormScrollView>
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
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  title: { color: ui.ink, marginTop: 26, marginBottom: 6 },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
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
  codeInput: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    letterSpacing: 6,
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
  resendLink: { alignItems: 'center', paddingVertical: 14 },
  resendLinkText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    color: ui.accent,
  },
});
