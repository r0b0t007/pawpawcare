import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useInFlight } from '../../hooks/useInFlight';
import { ui, type, radii, motion, photos } from '../../theme';
import { Button, TextField } from '../../components';
import SocialAuthButtons from '../../components/SocialAuthButtons';

// "Lively & Light" sign up: the same calm shape as log in — a small photo
// band (decorative only), labelled fields that Return walks through in order,
// one filled button. The two password rules are shown as they're met (icon +
// word), so nobody has to submit to find out; errors say what to do next.

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };
const MIN_PASSWORD = 6;

// A rule the password meets (or doesn't yet) — icon + word, never color alone.
function Rule({ met, label }) {
  return (
    <View style={styles.rule} accessible accessibilityRole="text" accessibilityLabel={`${label}${met ? ', done' : ''}`}>
      <MaterialCommunityIcons
        importantForAccessibility="no"
        accessibilityElementsHidden
        name={met ? 'check-circle' : 'checkbox-blank-circle-outline'}
        size={15}
        color={met ? ui.success : ui.faint}
      />
      <Text style={[styles.ruleText, met && { color: ui.success }]}>{label}</Text>
    </View>
  );
}

export default function SignupScreen({ navigation }) {
  const { signup, error, isLoading, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [localError, setLocalError] = useState(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  // One request per tap: a double tap (or Return + tap) never signs up twice.
  const { run, isBusy } = useInFlight();

  // Editing any field clears both the local validation error and the auth error.
  const onChange = (setter) => (value) => {
    setter(value);
    if (localError) setLocalError(null);
    if (error) clearError();
  };

  const handleSignup = () =>
    run('signup', async () => {
      if (!name.trim() || !email.trim() || !password || !confirmPwd) {
        setLocalError('Fill in each field to create your account.');
        return;
      }
      if (password !== confirmPwd) {
        setLocalError("The two passwords don't match yet. Try typing them again.");
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setLocalError(`Use at least ${MIN_PASSWORD} characters for your password.`);
        return;
      }
      setLocalError(null);
      await signup({ name: name.trim(), email: email.trim(), password });
      // On failure useAuth().error is set and rendered inline below.
    });

  const displayError = localError || error;
  const busy = isLoading || isBusy('signup');
  const longEnough = password.length >= MIN_PASSWORD;
  const matches = !!confirmPwd && password === confirmPwd;

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
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.goBack()}
            hitSlop={HIT}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
          </Pressable>

          <View style={styles.photoBand}>
            <Image
              source={photos.communityPals}
              style={styles.photo}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              importantForAccessibility="no"
            />
          </View>

          <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">Create your account</Text>
          <Text style={styles.subtitle}>Your pack's records, safe in one place.</Text>

          <View style={styles.form}>
            <TextField
              label="Your name"
              placeholder="e.g. Ahmed"
              value={name}
              onChangeText={onChange(setName)}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextField
              ref={emailRef}
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={onChange(setEmail)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />

            {/* One toggle reveals both password fields. */}
            <TextField
              ref={passwordRef}
              label="Password"
              secure
              revealed={showPwd}
              onToggleReveal={() => setShowPwd((v) => !v)}
              toggleLabel="passwords"
              placeholder={`${MIN_PASSWORD}+ characters`}
              value={password}
              onChangeText={onChange(setPassword)}
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextField
              ref={confirmRef}
              label="Confirm password"
              secure
              revealed={showPwd}
              showToggle={false}
              placeholder="Repeat password"
              value={confirmPwd}
              onChangeText={onChange(setConfirmPwd)}
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSignup}
            >
              <View style={styles.rules}>
                <Rule met={longEnough} label={`${MIN_PASSWORD}+ characters`} />
                <Rule met={matches} label="Passwords match" />
              </View>
            </TextField>
          </View>

          {displayError ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
              <MaterialCommunityIcons name="information-outline" size={18} color={ui.dangerText} />
              <Text style={styles.errorText} selectable>{displayError}</Text>
            </View>
          ) : null}

          <Button
            label={busy ? 'Creating account…' : 'Create account'}
            onPress={handleSignup}
            disabled={busy}
            style={styles.submitBtn}
          />

          <SocialAuthButtons />

          <Pressable
            style={({ pressed }) => [styles.switchLink, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => {
              if (error) clearError();
              navigation.navigate('Login');
            }}
            hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
            accessibilityRole="link"
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
  scroll: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40 },
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
  // Decorative, and short enough to keep four fields reachable on small phones.
  photoBand: {
    height: 104,
    marginTop: 16,
    borderRadius: radii.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: ui.accentTint,
  },
  // Explicit 100% box, not absoluteFill (react-native-web sizes an
  // absoluteFill <Image> at its natural size).
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  title: { color: ui.ink, marginTop: 22, marginBottom: 4 },
  subtitle: { ...type.body, color: ui.sub, marginBottom: 24 },
  form: { gap: 16 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.sub },
  // Status shown once, as icon + words, on its tint — calm, not alarming.
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: ui.dangerTint,
  },
  errorText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13.5,
    lineHeight: 19,
    color: ui.dangerText,
  },
  submitBtn: { marginTop: 24, paddingVertical: 16 },
  switchLink: { alignItems: 'center', paddingVertical: 14 },
  switchLinkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: ui.accent,
  },
});
