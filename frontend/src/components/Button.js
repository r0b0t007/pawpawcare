import React, { useState } from 'react';
import { Text, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, radii, motion } from '../theme';
import { EASE_OUT_CSS } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  // Plain-array style (not a function) so the CSS transition manager on the
  // animated component sees the pressed change and eases the scale.
  const [pressed, setPressed] = useState(false);

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={pill ? 6 : undefined}
      pressRetentionOffset={16}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          borderCurve: 'continuous',
          transform: [{ scale: pressed && !disabled ? motion.pressScale : 1 }],
          transitionProperty: 'transform',
          transitionDuration: motion.duration.press,
          transitionTimingFunction: EASE_OUT_CSS,
        },
        shape,
        v.container,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: motion.pressOpacitySoft },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={v.text.color} /> : null}
      <Text style={[{ fontSize, lineHeight: fontSize + 4 }, v.text]}>{label}</Text>
    </AnimatedPressable>
  );
}
