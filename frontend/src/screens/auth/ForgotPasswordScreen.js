import React, { useEffect, useRef, useState } from 'react';
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
import { useTranslation } from '../../i18n';
import { ui, type, radii, motion, photos } from '../../theme';
import { Button, showToast, FormScrollView, ScreenHeader, PhotoBand } from '../../components';

// Code-based password reset. Step 1 asks for the email; step 2 confirms a
// 6-digit code was sent and collects code + new password. The backend always
// answers 200 to the send, so step 2 shows for any address — no enumeration.

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useTranslation();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  // The step's main button, kept above the keyboard by FormScrollView (CHW-154).
  const submitRef = useRef(null);
  const [email, setEmail] = useState('');
  // Ties the code to this request (#195): only a reset sending it can check
  // the code, so a stranger asking for or guessing codes can't spoil it.
  // Each send replaces it: the code from this screen's latest send works.
  const [requestId, setRequestId] = useState(null);
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
      setError(t('auth.forgot.missingEmail'));
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await post('/auth/forgot-password', { email: trimmed, bind: true }, { skipAuth: true });
      setRequestId(res?.request_id ?? null);
      if (again) {
        showToast(t('auth.forgot.codeResent'));
      } else {
        setStep('code');
      }
    } catch (e) {
      setError(e?.message || t('errors.generic'));
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (code.trim().length !== 6) {
      setError(t('auth.forgot.badCode'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.forgot.tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.forgot.mismatch'));
      return;
    }
    setError(null);
    setResetting(true);
    try {
      await post(
        '/auth/reset-password',
        { email: email.trim(), code: code.trim(), password, ...(requestId ? { request_id: requestId } : {}) },
        { skipAuth: true },
      );
      showToast(t('auth.forgot.updated'));
      navigation.navigate('Login');
    } catch (e) {
      setError(e?.message || t('errors.generic'));
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

  // Android's back button and the iOS swipe behave like the on-screen
  // arrow: on the code step they return to the email step instead of
  // closing the screen and losing the code. A deliberate navigate (to
  // Login after a reset) isn't a back action, so it's let through.
  useEffect(() => {
    if (step !== 'code') return undefined;
    return navigation.addListener('beforeRemove', (e) => {
      if (e.data.action.type !== 'GO_BACK' && e.data.action.type !== 'POP') return;
      e.preventDefault();
      setError(null);
      setStep('email');
    });
  }, [navigation, step]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FormScrollView contentContainerStyle={styles.scroll} keepVisible={submitRef}>
        <ScreenHeader onBack={handleBack} flush />

        <PhotoBand source={photos.emptyBlanket} height={120} />

        {step === 'email' ? (
          <>
            <Text style={[type.screenTitle, styles.title]} accessibilityRole="header">{t('auth.forgot.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.forgot.subtitle')}
            </Text>

            <View style={styles.form}>
              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('auth.emailLabel')}</Text>
                <TextInput
                  style={[styles.input, focused === 'email' && styles.inputFocused]}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={ui.placeholder}
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

            <View ref={submitRef} collapsable={false}>
              <Button
                label={sending ? t('auth.forgot.sending') : t('auth.forgot.send')}
                onPress={() => sendCode()}
                disabled={sending}
                style={styles.submitBtn}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="email-check-outline" size={30} color={ui.accent} />
            </View>
            <Text style={[type.screenTitle, styles.title, { marginTop: 18 }]} accessibilityRole="header">
              {t('auth.forgot.checkTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('auth.forgot.checkBody', { email: email.trim() })}
            </Text>

            <View style={styles.form}>
              <View>
                <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('auth.forgot.codeLabel')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    focused === 'code' && styles.inputFocused,
                  ]}
                  placeholder="123456"
                  placeholderTextColor={ui.placeholder}
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
                <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('auth.forgot.newPasswordLabel')}</Text>
                <View style={[styles.inputRow, focused === 'password' && styles.inputFocused]}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder={t('auth.forgot.newPasswordPlaceholder')}
                    placeholderTextColor={ui.placeholder}
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
                    accessibilityLabel={showPwd ? t('auth.forgot.hidePassword') : t('auth.forgot.showPassword')}
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
                <Text style={[type.sectionLabel, styles.fieldLabel]}>{t('auth.confirmPasswordLabel')}</Text>
                <TextInput
                  style={[styles.input, focused === 'confirm' && styles.inputFocused]}
                  placeholder={t('auth.forgot.confirmPlaceholder')}
                  placeholderTextColor={ui.placeholder}
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

            <View ref={submitRef} collapsable={false}>
              <Button
                label={resetting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
                onPress={handleReset}
                disabled={resetting}
                style={styles.submitBtn}
              />
            </View>

            <Pressable accessibilityRole="button"
              style={({ pressed }) => [styles.resendLink, pressed && { opacity: motion.pressOpacity }]}
              onPress={() => sendCode({ again: true })}
              disabled={sending}
              hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
            >
              <Text style={[styles.resendLinkText, sending && { opacity: 0.5 }]}>
                {sending ? t('auth.forgot.sending') : t('auth.forgot.resend')}
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
  scroll: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 24, paddingBottom: 40 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  title: { color: ui.ink, marginTop: 22, marginBottom: 6 },
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
    borderColor: ui.inputBorder,
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
    borderColor: ui.inputBorder,
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
  // Focus = darker AND thicker (accent vs the tan outline is only 1.9:1).
  inputFocused: { borderColor: ui.accent, borderWidth: 2 },
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
