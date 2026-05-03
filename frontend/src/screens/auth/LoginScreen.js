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

export default function LoginScreen({ navigation }) {
  const { login, error, isLoading, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focused, setFocused] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    const ok = await login({ email: email.trim(), password });
    if (!ok) {
      Alert.alert('Login Failed', error || 'Invalid email or password.');
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your PawPawCare account</Text>
          </LinearGradient>

          {/* Form card */}
          <View style={styles.formCard}>
            <Field label="Email">
              <View style={[styles.inputRow, focused === 'email' && styles.inputFocused]}>
                <MaterialCommunityIcons name="email-outline" size={20} color={focused === 'email' ? colors.primaryContainer : colors.outline} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.outlineVariant}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused('')}
                  textContentType="emailAddress"
                  autoComplete="email"
                />
              </View>
            </Field>

            <Field label="Password">
              <View style={[styles.inputRow, focused === 'password' && styles.inputFocused]}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={focused === 'password' ? colors.primaryContainer : colors.outline} style={styles.icon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Your password"
                  placeholderTextColor={colors.outlineVariant}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused('')}
                  textContentType="password"
                  autoComplete="password"
                />
                <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eye} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.outline} />
                </TouchableOpacity>
              </View>
            </Field>

            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              {isLoading
                ? <ActivityIndicator color={colors.onPrimary} />
                : <Text style={styles.btnText}>Log In</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.footerLink}>Sign Up</Text>
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
