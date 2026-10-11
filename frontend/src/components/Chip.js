import React, { useState } from 'react';
import { Text, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { ui, motion } from '../theme';
import { EASE_OUT_CSS } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Filter/select chip: active = ink background, inactive = white + border.
// Active flips crossfade; press gives the standard kit scale.
export default function Chip({ label, active, onPress, style }) {
  const [pressed, setPressed] = useState(false);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={6}
      pressRetentionOffset={16}
      style={[
        {
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1.5,
          backgroundColor: active ? ui.ink : ui.surface,
          borderColor: active ? ui.ink : ui.controlBorder,
          transform: [{ scale: pressed ? motion.pressScale : 1 }],
          transitionProperty: ['transform', 'backgroundColor', 'borderColor'],
          transitionDuration: 150,
          transitionTimingFunction: EASE_OUT_CSS,
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
    </AnimatedPressable>
  );
}
