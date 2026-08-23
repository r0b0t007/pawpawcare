import React from 'react';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { ui } from '../theme';

// Pulsing placeholder block for loading states. Quiet by design — a slow
// opacity breath on the track color, no shimmer sweep. Static under reduced
// motion. Runs as a Reanimated CSS animation: pure UI thread, no state.
const PULSE = {
  animationName: {
    '0%': { opacity: 1 },
    '50%': { opacity: 0.55 },
    '100%': { opacity: 1 },
  },
  animationDuration: '1400ms',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
};

export default function Skeleton({ width, height = 14, radius = 7, style }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: ui.track },
        !reduced && PULSE,
        style,
      ]}
    />
  );
}
