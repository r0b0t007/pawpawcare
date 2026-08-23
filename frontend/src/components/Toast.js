import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ui, motion } from '../theme';
import { track } from '../services/analytics';
import { EASE_OUT } from './motion';

// Ink pill toast, bottom-center, auto-dismisses after 2.2s. Mount <ToastHost/>
// once (in App.js) and call showToast('Saved') from anywhere — every action
// gets feedback.
//
// Celebration variant: showToast('Dose logged', { celebrate: true, actionType })
// marks a completed care action — same single pill (no queue), but it springs
// in with a success haptic and carries a warm accent ring. Warm & Focused:
// no confetti, no emoji.
let emit = null;

const TOAST_ENTER = FadeInDown.duration(motion.duration.toast).easing(EASE_OUT);
const TOAST_EXIT = FadeOutDown.duration(200).easing(EASE_OUT);

export function showToast(message, { celebrate = false, actionType } = {}) {
  if (celebrate) track('celebration_shown', { action_type: actionType || 'unknown' });
  if (emit) emit(message, celebrate);
}

export function ToastHost() {
  const [toast, setToast] = useState(null); // { message, celebrate }
  const scale = useSharedValue(1);

  useEffect(() => {
    let timer;
    emit = (message, celebrate) => {
      clearTimeout(timer);
      setToast({ message, celebrate });
      if (celebrate) {
        scale.set(0.6);
        scale.set(withSpring(1, { duration: 400, dampingRatio: 0.7 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        scale.set(1);
      }
      timer = setTimeout(() => setToast(null), 2200);
    };
    return () => {
      emit = null;
      clearTimeout(timer);
    };
  }, [scale]);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      entering={TOAST_ENTER}
      exiting={TOAST_EXIT}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 104,
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={[
          {
            backgroundColor: ui.ink,
            paddingVertical: 11,
            paddingHorizontal: 20,
            borderRadius: 999,
            boxShadow: '0 8px 24px rgba(36, 26, 14, 0.3)',
            // Celebration: a quiet accent ring instead of confetti.
            borderWidth: toast.celebrate ? 2 : 0,
            borderColor: toast.celebrate ? ui.accent : 'transparent',
          },
          scaleStyle,
        ]}
      >
        <Text
          style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.background }}
        >
          {toast.message}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
