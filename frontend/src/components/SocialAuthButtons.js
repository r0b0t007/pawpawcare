import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../context/AuthContext';
import { showToast } from './Toast';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import { ui, radii } from '../theme';

// Guarded require (the codebase's defensive native-module pattern): a static
// import evaluates the native TurboModule at bundle load and throws on any
// binary that doesn't include it (Expo Go, dev clients built before the
// social-login release) — crashing every screen in the bundle, email login
// included. Resolve it lazily instead and just hide the button when absent.
let GoogleSignin = null;
let statusCodes = {};
try {
  ({ GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin'));
} catch (_) {
  // Native module absent — Google sign-in is unavailable on this build.
}

// The official Google "G" mark (brand asset). Google's guidelines permit a
// custom button as long as their logo and clear space are used unaltered.
function GoogleG({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

// Google + Apple sign-in for the Login/Signup screens. Google shows on every
// platform; Apple only on iOS where it's available — Sign in with Apple has no
// Android surface, and App Store Guideline 4.8 requires it alongside Google on
// iOS. Both hand the provider's token to AuthContext.socialLogin, which the
// backend verifies before issuing our own session.
export default function SocialAuthButtons() {
  const { socialLogin } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(null); // 'google' | 'apple' | null

  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((ok) => alive && setAppleAvailable(ok))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);

  const handleGoogle = async () => {
    if (busy) return;
    setBusy('google');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      // v13+ returns { type, data }; older builds resolve the payload directly.
      if (response?.type === 'cancelled') return;
      const idToken = response?.data?.idToken ?? response?.idToken;
      if (!idToken) throw new Error('No ID token returned from Google');
      await socialLogin('google', { id_token: idToken });
    } catch (e) {
      // User-cancelled and in-progress are not errors worth surfacing.
      if (
        e?.code === statusCodes.SIGN_IN_CANCELLED ||
        e?.code === statusCodes.IN_PROGRESS
      ) {
        return;
      }
      showToast("Couldn't sign in with Google");
    } finally {
      setBusy(null);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    setBusy('apple');
    try {
      // Replay guard: we send Apple the SHA-256 of a random nonce; Apple echoes
      // that hash in the token's `nonce` claim, and the backend re-hashes the
      // raw value we send it to confirm the token was minted for this request.
      const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      // Apple only sends the name on the very first authorization — forward it
      // so we can greet the user; it's optional on the backend.
      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(' ');

      await socialLogin('apple', {
        identity_token: credential.identityToken,
        raw_nonce: rawNonce,
        full_name: fullName || undefined,
      });
    } catch (e) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      showToast("Couldn't sign in with Apple");
    } finally {
      setBusy(null);
    }
  };

  // Google needs the native module AND a configured Web client ID to work;
  // without either the flow would just error, so hide the button entirely
  // rather than ship a dead control (mirrors how Apple hides when
  // unavailable, and the backend's 503).
  const showGoogle = !!GoogleSignin && !!GOOGLE_WEB_CLIENT_ID;
  const showApple = Platform.OS === 'ios' && appleAvailable;

  // Nothing to offer (e.g. Android with Google unconfigured) → no orphan divider.
  if (!showGoogle && !showApple) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.hairline} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.hairline} />
      </View>

      {showGoogle ? (
        <Pressable
          onPress={handleGoogle}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => [
            styles.googleBtn,
            busy && { opacity: 0.6 },
            pressed && !busy && { opacity: 0.85 },
          ]}
        >
          {busy === 'google' ? (
            <ActivityIndicator size="small" color={ui.ink} />
          ) : (
            <>
              <GoogleG size={18} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {showApple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.control}
          // Dimmed while a sign-in is in flight; taps are already no-ops via the
          // `busy` guard in handleApple.
          style={[styles.appleBtn, busy && { opacity: 0.6 }]}
          onPress={handleApple}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 22 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  hairline: { flex: 1, height: 1, backgroundColor: ui.border },
  dividerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: ui.subtle,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderWidth: 1.5,
    borderColor: ui.controlBorder,
    backgroundColor: ui.surface,
    borderRadius: radii.control,
    borderCurve: 'continuous',
  },
  googleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: ui.ink,
  },
  appleBtn: { height: 52, width: '100%' },
});
