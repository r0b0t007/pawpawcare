import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, radii } from '../../theme';

const { width } = Dimensions.get('window');

const FEATURES = [
  { icon: 'paw', label: 'Multiple Pets', bg: '#ffddb8', color: '#855300' },
  { icon: 'needle', label: 'Vaccinations', bg: '#c5e7ff', color: '#004c6a' },
  { icon: 'food', label: 'Favorite Foods', bg: '#d8e2ff', color: '#085ac0' },
  { icon: 'forum-outline', label: 'Community', bg: '#b2f2d4', color: '#006633' },
];

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#fff8f4', '#fef1e7', '#fff3e8']} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.bubble, styles.bubble1]} />
      <View style={[styles.bubble, styles.bubble2]} />

      <SafeAreaView style={styles.container}>
        <View style={styles.logoArea}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="paw" size={52} color={colors.primaryContainer} />
          </View>
          <Text style={styles.appName}>PawPawCare</Text>
          <Text style={styles.tagline}>Your pet's health, organized.</Text>
        </View>

        <View style={styles.grid}>
          {FEATURES.map((f) => (
            <View key={f.label} style={[styles.featureCard, { backgroundColor: f.bg }]}>
              <MaterialCommunityIcons name={f.icon} size={26} color={f.color} />
              <Text style={[styles.featureLabel, { color: f.color }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ctas}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Signup')} activeOpacity={0.85}>
            <MaterialCommunityIcons name="paw" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Log In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CARD_W = (width - spacing.margin * 2 - spacing.sm) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bubble: { position: 'absolute', borderRadius: radii.full, opacity: 0.2 },
  bubble1: { width: 300, height: 300, backgroundColor: colors.primaryFixed, top: -90, right: -90 },
  bubble2: { width: 220, height: 220, backgroundColor: colors.tertiaryFixed, bottom: 80, left: -70 },
  container: { flex: 1, paddingHorizontal: spacing.margin, justifyContent: 'space-between', paddingBottom: spacing.lg },
  logoArea: { alignItems: 'center', marginTop: spacing.xl },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  appName: { ...typography.headlineLg, color: colors.primaryContainer, marginBottom: spacing.xs },
  tagline: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  featureCard: {
    width: CARD_W,
    height: 110,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  featureLabel: { ...typography.labelMd, textAlign: 'center' },
  ctas: { gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.base,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  primaryBtnText: { ...typography.labelMd, color: colors.onPrimary, fontSize: 16 },
  secondaryBtn: {
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  secondaryBtnText: { ...typography.labelMd, color: colors.primaryContainer, fontSize: 16 },
});
