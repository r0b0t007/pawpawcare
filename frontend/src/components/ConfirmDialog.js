import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, Keyframe } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ui, radii } from '../theme';
import Button from './Button';
import AnimatedModal from './AnimatedModal';

// 280-wide centered dialog. Destructive confirms get the danger button —
// every delete in the app goes through this, never a bare trash icon.
const BACKDROP_IN = FadeIn.duration(150);
const BACKDROP_OUT = FadeOut.duration(120);
const CARD_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(180);
const CARD_OUT = FadeOut.duration(120);

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}) {
  const handleConfirm = () => {
    if (destructive) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm?.();
  };

  return (
    <AnimatedModal visible={visible} onRequestClose={onCancel} exitDuration={140}>
      {(showing) => (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {showing ? (
            <Animated.View
              entering={BACKDROP_IN}
              exiting={BACKDROP_OUT}
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(36, 26, 14, 0.4)' }]}
            />
          ) : null}
          {showing ? (
            <Animated.View
              entering={CARD_IN}
              exiting={CARD_OUT}
              style={{
                width: 280,
                backgroundColor: ui.surface,
                borderRadius: radii.dialog,
                borderCurve: 'continuous',
                padding: 24,
                gap: 8,
              }}
            >
              <Text
                style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: ui.ink }}
              >
                {title}
              </Text>
              {message ? (
                <Text
                  style={{
                    fontFamily: 'PlusJakartaSans_400Regular',
                    fontSize: 13,
                    lineHeight: 19,
                    color: ui.sub,
                  }}
                >
                  {message}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Button
                  small
                  variant="soft"
                  label={cancelLabel}
                  onPress={onCancel}
                  style={{ flex: 1 }}
                />
                <Button
                  small
                  variant={destructive ? 'danger' : 'primary'}
                  label={confirmLabel}
                  onPress={handleConfirm}
                  style={{ flex: 1 }}
                />
              </View>
            </Animated.View>
          ) : null}
        </View>
      )}
    </AnimatedModal>
  );
}
