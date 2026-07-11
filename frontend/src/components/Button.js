import React from 'react';
import { Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, radii } from '../theme';

const VARIANTS = {
  primary: {
    container: { backgroundColor: ui.accent },
    text: { color: '#ffffff', fontFamily: 'PlusJakartaSans_700Bold' },
  },
  ghost: {
    container: { borderWidth: 1.5, borderColor: ui.controlBorder },
    text: { color: ui.ink, fontFamily: 'PlusJakartaSans_600SemiBold' },
  },
  danger: {
    container: { backgroundColor: ui.danger },
    text: { color: '#ffffff', fontFamily: 'PlusJakartaSans_700Bold' },
  },
  soft: {
    container: { backgroundColor: ui.track },
    text: { color: ui.ink, fontFamily: 'PlusJakartaSans_700Bold' },
  },
};

// One button, four variants. `pill` is the compact header/action shape
// (e.g. "Add record"); `small` is the dialog size; default is the full-width
// form/card size (radius 14, padding 14).
export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  pill,
  small,
  disabled,
  style,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const shape = pill
    ? { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 }
    : small
      ? { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }
      : { borderRadius: radii.control, paddingVertical: 14, paddingHorizontal: 16 };
  const fontSize = pill ? 13 : small ? 13.5 : 14;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          borderCurve: 'continuous',
        },
        shape,
        v.container,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={v.text.color} /> : null}
      <Text style={[{ fontSize, lineHeight: fontSize + 4 }, v.text]}>{label}</Text>
    </Pressable>
  );
}
