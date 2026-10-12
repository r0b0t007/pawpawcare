import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useObserve } from '../../services/observe';
import { ui, type, motion, elevation, photos } from '../../theme';

// Logged-out landing screen ("Lively & Light"): a real cat and dog sharing a
// moment carries the first second (aesthetic-usability), then one message and
// one filled button in the thumb zone. Returning users get a quiet text link,
// so there is never a 50/50 choice.
export default function WelcomeScreen({ navigation }) {
  // TTI: entry screen for logged-out sessions — static, interactive on mount.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  // Light status-bar glyphs over the photo; back to dark when leaving.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView bounces={false} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image
            source={photos.welcomeHero}
            style={styles.heroImg}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessible
            accessibilityLabel="A kitten and a puppy looking at each other"
          />
          <LinearGradient
            colors={['rgba(36, 26, 14, 0.35)', 'rgba(36, 26, 14, 0)']}
            style={[styles.topScrim, { height: insets.top + 60 }]}
          />
        </View>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.brandRow}>
            <Image source={require('../../../assets/logo-mark.png')} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.brand}>PawPawCare</Text>
              <Text style={styles.brandSub}>Pet health, made gentle</Text>
            </View>
          </View>

          <Text style={styles.headline} accessibilityRole="header">
            Every wag and whisker,{'\n'}cared for.
          </Text>
          <Text style={styles.tagline}>
            Vaccines, meds and daily routines for all your pets, in one calm place.
          </Text>

          <View style={{ flex: 1, minHeight: 12 }} />

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: motion.pressOpacitySoft }]}
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Get started</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#ffffff" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.loginLink, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
            accessibilityRole="link"
          >
            <Text style={styles.loginLinkText}>I already have an account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.background },
  hero: { height: 460, backgroundColor: ui.accentTint },
  // Explicit 100% box, not absoluteFill: react-native-web leaves an
  // absoluteFill <Image> at its natural size instead of covering.
  heroImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  sheet: {
    flex: 1,
    marginTop: -40,
    backgroundColor: ui.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingTop: 26,
    paddingHorizontal: 24,
    gap: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12 },
  brand: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: ui.accent },
  brandSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: ui.sub },
  headline: { ...type.display, fontSize: 30, lineHeight: 36, color: ui.ink, marginTop: 6 },
  tagline: { ...type.body, fontSize: 15, lineHeight: 22, color: ui.sub, maxWidth: 330 },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 17,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: elevation.cta,
  },
  primaryBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#ffffff' },
  loginLink: { alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.accent },
});
