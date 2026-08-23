import React, { useEffect } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useObserve } from '../../services/observe';
import { ui, PET_COLOR_PAIRS, motion } from '../../theme';

// Logged-out landing screen: warm hero + one primary path (Signup) and a text
// link for returning users. Redesign direction 1g — flat surfaces, one accent.

const PACK = [
  { initial: 'B', ...PET_COLOR_PAIRS[0] },
  { initial: 'M', ...PET_COLOR_PAIRS[1] },
  { initial: 'K', ...PET_COLOR_PAIRS[2] },
];

export default function WelcomeScreen({ navigation }) {
  // TTI: entry screen for logged-out sessions — static, interactive on mount.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Image
            source={require('../../../assets/logo-mark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.headline}>Every tail,{'\n'}on track.</Text>
          <Text style={styles.tagline}>
            Vaccines, vet visits and daily care for all your pets — in one calm place.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.packRow}>
            {PACK.map((p, i) => (
              <View
                key={p.initial}
                style={[
                  styles.packAvatar,
                  { backgroundColor: p.bg },
                  i > 0 && styles.packAvatarOverlap,
                ]}
              >
                <Text style={[styles.packInitial, { color: p.fg }]}>{p.initial}</Text>
              </View>
            ))}
            <Text style={styles.packCaption}>Built for multi-pet homes</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: motion.pressOpacitySoft }]}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.primaryBtnText}>Get started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.loginLink, pressed && { opacity: motion.pressOpacity }]}
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
          >
            <Text style={styles.loginLinkText}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  hero: { gap: 22 },
  logo: { width: 88, height: 88 },
  headline: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 42,
    lineHeight: 45,
    letterSpacing: -1.2,
    color: ui.ink,
  },
  tagline: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    lineHeight: 25,
    color: ui.sub,
    maxWidth: 280,
  },
  footer: { gap: 14 },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  packAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: ui.background,
  },
  packAvatarOverlap: { marginLeft: -26 },
  packInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18 },
  packCaption: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: ui.subtle },
  primaryBtn: {
    paddingVertical: 17,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: ui.accent,
    alignItems: 'center',
  },
  primaryBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#ffffff' },
  loginLink: { alignItems: 'center', paddingVertical: 6 },
  loginLinkText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: ui.accent },
});
