import React from 'react';
import { Text, Pressable } from 'react-native';
import { ui } from '../theme';

// Filter/select chip: active = ink background, inactive = white + border.
export default function Chip({ label, active, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1.5,
          backgroundColor: active ? ui.ink : ui.surface,
          borderColor: active ? ui.ink : ui.controlBorder,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: 12.5,
          color: active ? ui.background : ui.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
