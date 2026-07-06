import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useObserve } from 'expo-observe';
import { colors, typography, spacing, radii, shadows } from '../../theme';

const { width } = Dimensions.get('window');

const FEATURES = [
  { icon: 'paw', label: 'Multiple Pets', bg: '#ffddb8', color: '#653e00' },
  { icon: 'needle', label: 'Vaccinations', bg: '#c5e7ff', color: '#004c6a' },
  { icon: 'food-drumstick-outline', label: 'Favorite Foods', bg: '#d8e2ff', color: '#085ac0' },
  { icon: 'account-group-outline', label: 'Community', bg: '#b2f2d4', color: '#1a6b3a' },
];

export default function WelcomeScreen({ navigation }) {
  // TTI: entry screen for logged-out sessions — static, interactive on mount.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#fff8f4', '#fef1e7', '#fce8d8']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Decorative blobs */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <View style={[styles.blob, styles.blob3]} />

      <SafeAreaView style={styles.container}>
        {/* Logo + Brand */}
        <View style={styles.logoArea}>
          <View style={styles.logoRing}>
            <View style={styles.logoBox}>
              <MaterialCommunityIcons name="paw" size={46} color={colors.primaryContainer} />
            </View>
          </View>
          <Text style={styles.appName}>PawPawCare</Text>
          <Text style={styles.tagline}>Health & happiness for your pets</Text>
        </View>

        {/* Feature cards grid */}
        <View style={styles.grid}>
          {FEATURES.map((f) => (
            <View key={f.label} style={[styles.featureCard, { backgroundColor: f.bg }]}>
              <View style={[styles.featureIconWrap, { backgroundColor: 'rgba(255,255,255,0.6)' }]}>
                <MaterialCommunityIcons name={f.icon} size={24} color={f.color} />
              </View>
              <Text style={[styles.featureLabel, { color: f.color }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Signup')}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="paw" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.88}
          >
            <Text style={styles.secondaryBtnText}>Already have an account? Log In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const CARD_W = (width - spacing.margin * 2 - spacing.sm) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  blob: { position: 'absolute', borderRadius: radii.full, opacity: 0.18 },
  blob1: { width: 340, height: 340, backgroundColor: colors.primaryFixed, top: -120, right: -110 },
  blob2: { width: 240, height: 240, backgroundColor: colors.tertiaryFixed, bottom: 100, left: -80 },
  blob3: { width: 120, height: 120, backgroundColor: colors.secondaryFixed, top: '45%', right: -20 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.margin,
    justifyContent: 'space-evenly',
    paddingBottom: spacing.md,
  },
  logoArea: { alignItems: 'center' },
  logoRing: {
    width: 116,
    height: 116,
    borderRadius: radii.full,
    backgroundColor: 'rgba(253,185,101,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoBox: {
    width: 92,
    height: 92,
    borderRadius: radii.full,
    backgroundColor: colors.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.medium,
  },
  appName: {
    ...typography.headlineLg,
    color: colors.primaryContainer,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  tagline: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  featureCard: {
    width: CARD_W,
    height: 118,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    ...shadows.card,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureLabel: {
    ...typography.labelMd,
    textAlign: 'center',
    fontSize: 13,
  },
  ctas: { gap: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.base,
    ...shadows.button,
  },
  primaryBtnText: {
    ...typography.labelMd,
    color: colors.onPrimary,
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...typography.labelMd,
    color: colors.primaryContainer,
    fontSize: 14,
  },
});
