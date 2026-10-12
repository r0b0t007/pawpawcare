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

// "Lively & Light" log in: a small photo band carries the warmth of Welcome
// (decorative only), then two labelled fields and one filled button. Return
// moves email → password → log in, so the keyboard never has to close; the
// error is one calm line that says what to do, never whose fault it was.

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export default function LoginScreen({ navigation }) {
  const { login, error, isLoading, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState(null);
  const passwordRef = useRef(null);
  // One request per tap: a double tap (or Return + tap) never logs in twice.
  const { run, isBusy } = useInFlight();

  // Editing any field clears both the local validation error and the auth error.
  const onChange = (setter) => (value) => {
    setter(value);
    if (localError) setLocalError(null);
    if (error) clearError();
  };

  const handleLogin = () =>
    run('login', async () => {
      if (!email.trim() || !password) {
        setLocalError('Add your email and password to log in.');
        return;
      }
      setLocalError(null);
      await login({ email: email.trim(), password });
      // On failure useAuth().error is set and rendered inline below.
    });

  const displayError = localError || error;
  const busy = isLoading || isBusy('login');

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
              source={photos.welcomeHero}
              style={styles.photo}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              importantForAccessibility="no"
            />
          </View>

          <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">Welcome back</Text>
          <Text style={styles.subtitle}>The pack missed you.</Text>

          <View style={styles.form}>
            <TextField
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

            <TextField
              ref={passwordRef}
              label="Password"
              secure
              placeholder="Your password"
              value={password}
              onChangeText={onChange(setPassword)}
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            >
              <View style={styles.forgotRow}>
                <Text style={styles.pasteHint}>
                  Paste from your password manager always works
                </Text>
                <Pressable
                  onPress={() => {
                    if (error) clearError();
                    navigation.navigate('ForgotPassword');
                  }}
                  hitSlop={HIT}
                  accessibilityRole="link"
                >
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </Pressable>
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
            label={busy ? 'Logging in…' : 'Log in'}
            onPress={handleLogin}
            disabled={busy}
            style={styles.submitBtn}
          />

          <SocialAuthButtons />

          <Pressable
            style={({ pressed }) => [styles.switchLink, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => {
              if (error) clearError();
              navigation.navigate('Signup');
            }}
            hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
            accessibilityRole="link"
          >
            <Text style={styles.switchLinkText}>New here? Create an account</Text>
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
  // Decorative, and short enough that the form stays above the keyboard.
  photoBand: {
    height: 120,
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
  forgotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  pasteHint: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: ui.sub,
  },
  forgotLink: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: ui.accent,
  },
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
