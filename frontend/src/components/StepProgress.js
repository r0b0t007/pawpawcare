import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ui, motion } from '../theme';
import { EASE_OUT_CSS } from './motion';

// Segmented progress (goal-gradient): `done` of `total` segments filled.
// Used for multi-step flows (accent) and "x of y done today" (success tint).
export default function StepProgress({ done, total, tone = 'accent', height = 6, style }) {
  const fill = tone === 'success' ? ui.ringOk : ui.accent;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={[{ flexDirection: 'row', gap: 6 }, style]}
    >
      {Array.from({ length: total }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: height / 2,
            backgroundColor: i < done ? fill : ui.track,
            transitionProperty: 'backgroundColor',
            transitionDuration: motion.duration.control,
            transitionTimingFunction: EASE_OUT_CSS,
          }}
        />
      ))}
    </View>
  );
}
