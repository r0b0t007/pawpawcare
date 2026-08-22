import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { ui } from '../theme';
import { track } from '../services/analytics';

// Ink pill toast, bottom-center, auto-dismisses after 2.2s. Mount <ToastHost/>
// once (in App.js) and call showToast('Saved') from anywhere — every action
// gets feedback.
//
// Celebration variant: showToast('Dose logged', { celebrate: true, actionType })
// marks a completed care action — same single pill (no queue), but it springs
// in and carries a warm accent ring. Warm & Focused: no confetti, no emoji.
let emit = null;

export function showToast(message, { celebrate = false, actionType } = {}) {
  if (celebrate) track('celebration_shown', { action_type: actionType || 'unknown' });
  if (emit) emit(message, celebrate);
}

export function ToastHost() {
  const [toast, setToast] = useState(null); // { message, celebrate }
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timer;
    emit = (message, celebrate) => {
      clearTimeout(timer);
      setToast({ message, celebrate });
      if (celebrate) {
        scale.setValue(0.6);
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }).start();
      } else {
        scale.setValue(1);
      }
      timer = setTimeout(() => setToast(null), 2200);
    };
    return () => {
      emit = null;
      clearTimeout(timer);
    };
  }, [scale]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 104,
        alignItems: 'center',
        transform: [{ scale }],
      }}
    >
      <Animated.View
        style={{
          backgroundColor: ui.ink,
          paddingVertical: 11,
          paddingHorizontal: 20,
          borderRadius: 999,
          boxShadow: '0 8px 24px rgba(36, 26, 14, 0.3)',
          // Celebration: a quiet accent ring instead of confetti.
          borderWidth: toast.celebrate ? 2 : 0,
          borderColor: toast.celebrate ? ui.accent : 'transparent',
        }}
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
