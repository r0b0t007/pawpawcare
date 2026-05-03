import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { colors, typography, spacing, radii, shadows } from '../../theme';

export default function SignupScreen({ navigation }) {
  const { signup, error, isLoading, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focused, setFocused] = useState('');

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPwd) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPwd) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    const ok = await signup({ name: name.trim(), email: email.trim(), password });
    if (!ok) {
      Alert.alert('Signup Failed', error || 'Something went wrong.');
      clearError();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header band */}
          <LinearGradient colors={['#fef1e7', '#fff8f4']} style={styles.headerBand}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <View style={styles.logoMini}>
              <MaterialCommunityIcons name="paw" size={30} color={colors.primaryContainer} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join PawPawCare and care for your pets</Text>
          </LinearGradient>

          {/* Form card */}
          <View style={styles.formCard}>
            <Field label="Full Name">
              <InputRow
                icon="account-outline"
                placeholder="Your full name"
                value={name}
                onChangeText={setName}
                focused={focused === 'name'}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused('')}
                textContentType="name"
                autoComplete="name"
              />
            </Field>

            <Field label="Email">
              <InputRow
                icon="email-outline"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                focused={focused === 'email'}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused('')}
                textContentType="emailAddress"
                autoComplete="email"
              />
            </Field>

            <Field label="Password">
              <View style={[styles.inputRow, focused === 'pwd' && styles.inputFocused]}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={focused === 'pwd' ? colors.primaryContainer : colors.outline} style={styles.icon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.outlineVariant}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  onFocus={() => setFocused('pwd')}
                  onBlur={() => setFocused('')}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
                <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eye} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.outline} />
                </TouchableOpacity>
              </View>
            </Field>

            <Field label="Confirm Password">
              <InputRow
                icon="lock-check-outline"
                placeholder="Repeat password"
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry={!showPwd}
                focused={focused === 'confirm'}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused('')}
                textContentType="newPassword"
              />
            </Field>

            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleSignup}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="paw" size={18} color={colors.onPrimary} />
                  <Text style={styles.btnText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.footerLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function InputRow({ icon, placeholder, value, onChangeText, keyboardType, autoCapitalize, secureTextEntry, focused, onFocus, onBlur, textContentType, autoComplete }) {
  return (
    <View style={[styles.inputRow, focused && styles.inputFocused]}>
      <MaterialCommunityIcons name={icon} size={20} color={focused ? colors.primaryContainer : colors.outline} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.outlineVariant}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        onFocus={onFocus}
        onBlur={onBlur}
        textContentType={textContentType}
        autoComplete={autoComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingBottom: spacing.xl },
  headerBand: {
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoMini: {
    width: 60,
    height: 60,
    borderRadius: radii.xxl,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.card,
  },
  title: { ...typography.headlineMd, color: colors.onBackground, marginBottom: spacing.xs },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  formCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: spacing.margin,
    borderRadius: radii.xxl,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: -spacing.md,
    ...shadows.medium,
  },
  label: { ...typography.labelMd, color: colors.onSurface },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    minHeight: 54,
  },
  inputFocused: {
    borderColor: colors.primaryContainer,
    backgroundColor: colors.surfaceContainerLowest,
  },
  icon: { marginRight: spacing.base },
  input: { flex: 1, ...typography.bodyMd, color: colors.onSurface, paddingVertical: spacing.sm },
  eye: { padding: spacing.xs },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    flexDirection: 'row',
    gap: spacing.base,
    marginTop: spacing.xs,
    ...shadows.button,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 16 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  footerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  footerLink: { ...typography.labelMd, color: colors.primaryContainer, fontSize: 16 },
});
