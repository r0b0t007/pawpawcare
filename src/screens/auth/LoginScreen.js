import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, typography, spacing, radii } from '../../theme';

export default function LoginScreen({ navigation }) {
  const { login, error, isLoading, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.logoMini}>
              <MaterialCommunityIcons name="paw" size={28} color={colors.primaryContainer} />
            </View>
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.subtitle}>Log in to your PawPawCare account</Text>
          </View>

          <View style={styles.form}>
            <Field label="Email">
              <View style={styles.inputRow}>
                <MaterialCommunityIcons name="email-outline" size={20} color={colors.outline} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </Field>

            <Field label="Password">
              <View style={styles.inputRow}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.outline} style={styles.icon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Your password"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                />
                <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eye}>
                  <MaterialCommunityIcons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.outline} />
                </TouchableOpacity>
              </View>
            </Field>

            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={isLoading} activeOpacity={0.85}>
              {isLoading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.btnText}>Log In</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
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
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.xl },
  back: {
    marginTop: spacing.md,
    marginBottom: spacing.base,
    width: 40, height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  header: { marginTop: spacing.md, marginBottom: spacing.lg },
  logoMini: {
    width: 52, height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.headlineMd, color: colors.onBackground, marginBottom: spacing.xs },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  form: { gap: spacing.md, flex: 1 },
  label: { ...typography.labelMd, color: colors.onSurface },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant,
    minHeight: 52,
  },
  icon: { marginRight: spacing.base },
  input: { flex: 1, ...typography.bodyMd, color: colors.onSurface, paddingVertical: spacing.sm },
  eye: { padding: spacing.xs },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm, minHeight: 54,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 5,
  },
  btnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg, flexWrap: 'wrap' },
  footerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  footerLink: { ...typography.labelMd, color: colors.primaryContainer, textDecorationLine: 'underline' },
});
