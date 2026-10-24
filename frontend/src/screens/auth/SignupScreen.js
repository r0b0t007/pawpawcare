import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useInFlight } from '../../hooks/useInFlight';
import { useTranslation } from '../../i18n';
import { ui, type, motion, photos } from '../../theme';
import { Button, TextField, ScreenHeader, PhotoBand, FormError, FormScrollView } from '../../components';
import SocialAuthButtons from '../../components/SocialAuthButtons';

// "Lively & Light" sign up: the same calm shape as log in — a small photo
// band (decorative only), labelled fields that Return walks through in order,
// one filled button. The two password rules are shown as they're met (icon +
// word), so nobody has to submit to find out; errors say what to do next.

const MIN_PASSWORD = 6;

// A rule the password meets (or doesn't yet) — icon + word, never color alone.
function Rule({ met, label }) {
  const { t } = useTranslation();
  return (
    <View style={styles.rule} accessible accessibilityRole="text" accessibilityLabel={met ? t('auth.signup.ruleDone', { rule: label }) : label}>
      <MaterialCommunityIcons
        importantForAccessibility="no"
        accessibilityElementsHidden
        name={met ? 'check-circle' : 'checkbox-blank-circle-outline'}
        size={15}
        color={met ? ui.success : ui.subtle}
      />
      <Text style={[styles.ruleText, met && { color: ui.success }]}>{label}</Text>
    </View>
  );
}

export default function SignupScreen({ navigation }) {
  const { t } = useTranslation();
  const { signup, error, authBusy, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  // An i18n key, so the message follows a language change while shown.
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

  // The Return key bypasses the disabled button, so check here too: no
  // signup while one (or a Google sign-in) is already running.
  const handleSignup = () =>
    !authBusy && run('signup', async () => {
      if (!name.trim() || !email.trim() || !password || !confirmPwd) {
        setLocalError('auth.signup.missingFields');
        return;
      }
      if (password !== confirmPwd) {
        setLocalError('auth.signup.mismatch');
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setLocalError('auth.signup.tooShort');
        return;
      }
      setLocalError(null);
      await signup({ name: name.trim(), email: email.trim(), password });
      // On failure useAuth().error is set and rendered inline below.
    });

  const displayError = (localError && t(localError, { min: MIN_PASSWORD })) || error;
  const minChars = t('auth.signup.minChars', { min: MIN_PASSWORD });
  const busy = authBusy || isBusy('signup');
  const longEnough = password.length >= MIN_PASSWORD;
  const matches = !!confirmPwd && password === confirmPwd;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader onBack={() => navigation.goBack()} flush />

        <PhotoBand source={photos.communityPals} height={104} />

        <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">{t('auth.signup.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.signup.subtitle')}</Text>

        <View style={styles.form}>
          <TextField
            label={t('auth.signup.nameLabel')}
            placeholder={t('auth.signup.namePlaceholder')}
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
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
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
            label={t('auth.passwordLabel')}
            secure
            revealed={showPwd}
            onToggleReveal={() => setShowPwd((v) => !v)}
            toggleLabel={t('auth.signup.passwordsToggle')}
            placeholder={minChars}
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
            label={t('auth.confirmPasswordLabel')}
            secure
            revealed={showPwd}
            showToggle={false}
            placeholder={t('auth.signup.confirmPlaceholder')}
            value={confirmPwd}
            onChangeText={onChange(setConfirmPwd)}
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSignup}
          >
            <View style={styles.rules}>
              <Rule met={longEnough} label={minChars} />
              <Rule met={matches} label={t('auth.signup.rulesMatch')} />
            </View>
          </TextField>
        </View>

        <FormError message={displayError} style={styles.formError} />

        <Button
          label={busy ? t('auth.signup.submitting') : t('auth.signup.submit')}
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
          <Text style={styles.switchLinkText}>{t('auth.signup.toLogin')}</Text>
        </Pressable>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40 },
  // Decorative, and short enough to keep four fields reachable on small phones.
  // The scroll already pads the sides and top; the photo band sits 16 below.
  title: { color: ui.ink, marginTop: 22, marginBottom: 4 },
  formError: { marginTop: 16 },
  subtitle: { ...type.body, color: ui.sub, marginBottom: 24 },
  form: { gap: 16 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12.5, color: ui.sub },
  submitBtn: { marginTop: 24, paddingVertical: 16 },
  switchLink: { alignItems: 'center', paddingVertical: 14 },
  switchLinkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: ui.accent,
  },
});
