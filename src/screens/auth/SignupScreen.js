import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, typography, spacing, radii } from '../../theme';

export default function SignupScreen({ navigation }) {
  const { signup, error, isLoading, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);

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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join PawPawCare and start managing your pets</Text>
          </View>

          <View style={styles.form}>
            <Field label="Full Name">
              <InputRow icon="account-outline" placeholder="Your full name" value={name} onChangeText={setName} />
            </Field>

            <Field label="Email">
              <InputRow
                icon="email-outline"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Password">
              <View style={styles.inputRow}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.outline} style={styles.icon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Min. 6 characters"
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

            <Field label="Confirm Password">
              <InputRow icon="lock-check-outline" placeholder="Repeat password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry={!showPwd} />
            </Field>

            <TouchableOpacity style={styles.btn} onPress={handleSignup} disabled={isLoading} activeOpacity={0.85}>
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
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
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
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function InputRow({ icon, placeholder, value, onChangeText, keyboardType, autoCapitalize, secureTextEntry }) {
  return (
    <View style={styles.inputRow}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.outline} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceVariant}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.xl },
  back: {
    marginTop: spacing.md, marginBottom: spacing.base,
    width: 40, height: 40, borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  header: { marginTop: spacing.sm, marginBottom: spacing.lg },
  logoMini: {
    width: 52, height: 52, borderRadius: radii.lg,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  title: { ...typography.headlineMd, color: colors.onBackground, marginBottom: spacing.xs },
  subtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  form: { gap: spacing.md },
  label: { ...typography.labelMd, color: colors.onSurface },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.DEFAULT, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant, minHeight: 52,
  },
  icon: { marginRight: spacing.base },
  input: { flex: 1, ...typography.bodyMd, color: colors.onSurface, paddingVertical: spacing.sm },
  eye: { padding: spacing.xs },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md, borderRadius: radii.lg,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm, minHeight: 54,
    flexDirection: 'row', gap: spacing.base,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 5,
  },
  btnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg, flexWrap: 'wrap' },
  footerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  footerLink: { ...typography.labelMd, color: colors.primaryContainer, textDecorationLine: 'underline' },
});
