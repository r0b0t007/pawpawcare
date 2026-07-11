import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { ui } from '../theme';

// Ink pill toast, bottom-center, auto-dismisses after 2.2s. Mount <ToastHost/>
// once (in App.js) and call showToast('Saved') from anywhere — every action
// gets feedback.
let emit = null;

export function showToast(message) {
  if (emit) emit(message);
}

export function ToastHost() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let timer;
    emit = (msg) => {
      clearTimeout(timer);
      setMessage(msg);
      timer = setTimeout(() => setMessage(null), 2200);
    };
    return () => {
      emit = null;
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 104, alignItems: 'center' }}
    >
      <View
        style={{
          backgroundColor: ui.ink,
          paddingVertical: 11,
          paddingHorizontal: 20,
          borderRadius: 999,
          boxShadow: '0 8px 24px rgba(36, 26, 14, 0.3)',
        }}
      >
        <Text
          style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: ui.background }}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}
