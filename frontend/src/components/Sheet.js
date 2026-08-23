import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui, type, radii, motion } from '../theme';
import { project, rubberband } from './motion';
import AnimatedModal from './AnimatedModal';

// Bottom sheet: dim backdrop (tap to close), radius-28 top corners, and a drag
// handle that actually drags — grab the handle/title zone to dismiss. Velocity
// decides (a flick is enough); upward drags rubber-band; the backdrop opacity
// derives from the sheet position so they can never desync.
const SPRING_IN = { duration: motion.duration.sheet, dampingRatio: 0.8 };
const SCREEN_H = Dimensions.get('window').height;

export default function Sheet({ visible, onClose, title, children, style }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const height = useSharedValue(0); // measured sheet height
  const translateY = useSharedValue(SCREEN_H); // offscreen until measured
  const fade = useSharedValue(0); // reduced-motion show/hide
  const context = useSharedValue(0);
  const entered = useRef(false);

  // Stable close callback so the pan gesture is created once — rebuilding a
  // gesture on a parent re-render can drop a drag mid-flight. Worklets capture
  // by value, so the ref is read on the RN side, never from the worklet.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const requestClose = useCallback(() => onCloseRef.current?.(), []);

  useEffect(() => {
    if (visible) {
      if (reduced) {
        translateY.set(0);
        fade.set(withTiming(1, { duration: 200 }));
        entered.current = true;
      } else if (height.get() > 0) {
        // Re-shown with a known height (entrance from onLayout otherwise).
        fade.set(1);
        translateY.set(height.get());
        translateY.set(withSpring(0, SPRING_IN));
        entered.current = true;
      }
    } else if (entered.current) {
      entered.current = false;
      if (reduced) {
        fade.set(withTiming(0, { duration: 150 }));
      } else {
        translateY.set(
          withSpring(height.get() || SCREEN_H, {
            duration: motion.duration.sheet,
            dampingRatio: 1,
            overshootClamping: true,
          })
        );
      }
    }
  }, [visible, reduced, translateY, fade, height]);

  const onSheetLayout = (e) => {
    const h = e.nativeEvent.layout.height;
    height.set(h);
    if (!entered.current && visible && !reduced) {
      // First layout while opening: start just offscreen, spring home.
      entered.current = true;
      fade.set(1);
      translateY.set(h);
      translateY.set(withSpring(0, SPRING_IN));
    }
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .hitSlop({ top: 8, bottom: 12 })
        .onStart(() => {
          context.set(translateY.get()); // continue from wherever the sheet is
        })
        .onUpdate((e) => {
          const next = context.get() + e.translationY;
          // Downward is free; upward past the top resists.
          translateY.set(next >= 0 ? next : rubberband(next, height.get()));
        })
        .onEnd((e) => {
          const h = height.get();
          const projected = translateY.get() + project(e.velocityY);
          if (projected > h * 0.4) {
            translateY.set(
              withSpring(
                h,
                {
                  duration: motion.duration.sheet,
                  dampingRatio: 1,
                  velocity: e.velocityY,
                  overshootClamping: true,
                },
                (finished) => {
                  if (finished) scheduleOnRN(requestClose);
                }
              )
            );
          } else {
            translateY.set(
              withSpring(0, {
                duration: motion.duration.sheet,
                dampingRatio: 0.8,
                velocity: e.velocityY,
              })
            );
            scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light);
          }
        }),
    [requestClose, context, translateY, height]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
    opacity: reduced ? fade.get() : 1,
  }));

  const backdropStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: fade.get() };
    const h = height.get();
    return {
      opacity: h > 0 ? interpolate(translateY.get(), [0, h], [1, 0], Extrapolation.CLAMP) : 0,
    };
  });

  return (
    <AnimatedModal
      visible={visible}
      onRequestClose={onClose}
      exitDuration={motion.duration.sheet + 50}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          pointerEvents={visible ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(36, 26, 14, 0.35)' },
            backdropStyle,
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          onLayout={onSheetLayout}
          style={[
            {
              backgroundColor: ui.surface,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              borderCurve: 'continuous',
              paddingHorizontal: 24,
              paddingBottom: Math.max(30, insets.bottom + 14),
              gap: 16,
            },
            sheetStyle,
            style,
          ]}
        >
          <GestureDetector gesture={pan}>
            {/* Grabber zone: handle + title. The pan lives here, not on the
                whole sheet, so forms and pickers inside never fight it. */}
            <View style={{ paddingTop: 14, gap: 16, marginHorizontal: -24, paddingHorizontal: 24 }}>
              <View
                style={{
                  alignSelf: 'center',
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: ui.controlBorder,
                }}
              />
              {title ? <Text style={[type.cardTitle, { color: ui.ink }]}>{title}</Text> : null}
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </View>
    </AnimatedModal>
  );
}
