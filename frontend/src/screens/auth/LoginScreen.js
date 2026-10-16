import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useInFlight } from '../../hooks/useInFlight';
import { useTranslation } from '../../i18n';
import { ui, type, motion, photos } from '../../theme';
import { Button, TextField, ScreenHeader, PhotoBand, FormError, FormScrollView } from '../../components';
import SocialAuthButtons from '../../components/SocialAuthButtons';

// "Lively & Light" log in: a small photo band carries the warmth of Welcome
// (decorative only), then two labelled fields and one filled button. Return
// moves email → password → log in, so the keyboard never has to close; the
// error is one calm line that says what to do, never whose fault it was.

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const { login, error, isLoading, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // An i18n key, so the message follows a language change while shown.
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

  // The Return key bypasses the disabled button, so check here too: no
  // email login while one (or a Google sign-in) is already running.
  const handleLogin = () =>
    !isLoading && run('login', async () => {
      if (!email.trim() || !password) {
        setLocalError('auth.login.missingFields');
        return;
      }
      setLocalError(null);
      await login({ email: email.trim(), password });
      // On failure useAuth().error is set and rendered inline below.
    });

  const displayError = (localError && t(localError)) || error;
  const busy = isLoading || isBusy('login');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FormScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader onBack={() => navigation.goBack()} flush />

        <PhotoBand source={photos.welcomeHero} height={120} />

        <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">{t('auth.login.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>

        <View style={styles.form}>
          <TextField
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

          <TextField
            ref={passwordRef}
            label={t('auth.passwordLabel')}
            secure
            placeholder={t('auth.login.passwordPlaceholder')}
            value={password}
            onChangeText={onChange(setPassword)}
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          >
            <View style={styles.forgotRow}>
              <Text style={styles.pasteHint}>
                {t('auth.login.pasteHint')}
              </Text>
              <Pressable
                onPress={() => {
                  if (error) clearError();
                  navigation.navigate('ForgotPassword');
                }}
                hitSlop={HIT}
                accessibilityRole="link"
              >
                <Text style={styles.forgotLink}>{t('auth.login.forgot')}</Text>
              </Pressable>
            </View>
          </TextField>
        </View>

        <FormError message={displayError} style={styles.formError} />

        <Button
          label={busy ? t('auth.login.submitting') : t('auth.login.submit')}
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
          <Text style={styles.switchLinkText}>{t('auth.login.toSignup')}</Text>
        </Pressable>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40 },
  // The scroll already pads the sides and top; the photo band sits 16 below.
  title: { color: ui.ink, marginTop: 22, marginBottom: 4 },
  formError: { marginTop: 16 },
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
  submitBtn: { marginTop: 24, paddingVertical: 16 },
  switchLink: { alignItems: 'center', paddingVertical: 14 },
  switchLinkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: ui.accent,
  },
});
