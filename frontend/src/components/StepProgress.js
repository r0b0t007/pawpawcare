import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ui, motion } from '../theme';
import { EASE_OUT_CSS } from './motion';

// Past this many steps, segments (6px gaps each) would shrink to slivers —
// switch to one continuous bar.
const MAX_SEGMENTS = 12;

// Segmented progress (goal-gradient): `done` of `total` segments filled.
// Used for multi-step flows (accent) and "x of y done today" (success tint).
// A busy household's dose count can exceed MAX_SEGMENTS: then it's a single
// track with a proportional fill.
export default function StepProgress({ done, total, tone = 'accent', height = 6, style }) {
  const fill = tone === 'success' ? ui.ringOk : ui.accent;
  if (total > MAX_SEGMENTS) {
    const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: done }}
        style={[{ height, borderRadius: height / 2, backgroundColor: ui.track, overflow: 'hidden' }, style]}
      >
        <Animated.View
          style={{
            width: `${pct}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: fill,
            transitionProperty: 'width',
            transitionDuration: motion.duration.control,
            transitionTimingFunction: EASE_OUT_CSS,
          }}
        />
      </View>
    );
  }
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
