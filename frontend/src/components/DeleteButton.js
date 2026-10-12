import React from 'react';
import { Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, motion } from '../theme';

// A row's delete: a small, quiet trash glyph (destructive, so never prominent)
// with a 44pt touch target and a spoken label naming what it deletes. The
// caller still puts the actual delete behind ConfirmDialog.
export default function DeleteButton({ label, onPress, size = 17, style }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: motion.pressOpacity },
        style,
      ]}
    >
      <MaterialCommunityIcons name="trash-can-outline" size={size} color={ui.faint} />
    </Pressable>
  );
}
