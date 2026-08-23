import { Easing } from 'react-native-reanimated';

// Shared motion ingredients (animate-expo). Springs use Apple's two designer
// parameters (duration + dampingRatio); beziers mirror motion.easeOutCss /
// easeInOutCss in the theme.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// Where a flick would come to rest if it kept decelerating (Apple's
// exponential-decay form). Lets velocity decide a dismissal, not distance.
export function project(velocity, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// The further past the edge, the less the element follows.
export function rubberband(overshoot, dimension, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
