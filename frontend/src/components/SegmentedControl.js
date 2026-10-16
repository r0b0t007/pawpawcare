import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ui, radii, motion } from '../theme';
import { EASE_IN_OUT } from './motion';

// Tint track + white raised thumb. `segments` is [{ value, label }].
// The thumb is one absolutely-positioned childless pill that slides between
// segments (measured via onLayout) — the sanctioned width animation.
// `role`: 'tabs' (default) when segments switch views, 'radio' when they pick
// one value (e.g. the paywall's Annual/Monthly plan) — screen readers announce
// a tab list or a radio group accordingly.
export default function SegmentedControl({ segments, value, onChange, style, role = 'tabs' }) {
  const radio = role === 'radio';
  const [layouts, setLayouts] = useState({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    if (!placed.current) {
      // First layout: position without animating.
      placed.current = true;
      x.set(l.x);
      w.set(l.width);
    } else {
      const timing = { duration: motion.duration.control, easing: EASE_IN_OUT };
      x.set(withTiming(l.x, timing));
      w.set(withTiming(l.width, timing));
    }
  }, [value, layouts, x, w]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    width: w.get(),
    opacity: w.get() ? 1 : 0,
  }));

  return (
    <View
      accessibilityRole={radio ? 'radiogroup' : 'tablist'}
      style={[
        {
          flexDirection: 'row',
          gap: 4,
          backgroundColor: ui.track,
          borderRadius: radii.control,
          padding: 4,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 0,
            borderRadius: radii.thumb,
            backgroundColor: ui.surface,
            boxShadow: '0 1px 3px rgba(60, 40, 10, 0.08)',
          },
          thumbStyle,
        ]}
      />
      {segments.map((seg) => {
        const on = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            accessibilityRole={radio ? 'radio' : 'tab'}
            accessibilityState={radio ? { checked: on } : { selected: on }}
            onLayout={(e) => {
              const { x: lx, width } = e.nativeEvent.layout;
              setLayouts((prev) =>
                prev[seg.value]?.x === lx && prev[seg.value]?.width === width
                  ? prev
                  : { ...prev, [seg.value]: { x: lx, width } }
              );
            }}
            onPress={() => {
              if (seg.value !== value) Haptics.selectionAsync();
              onChange(seg.value);
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 9,
              borderRadius: radii.thumb,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 13,
                // sub, not subtle: unselected labels sit on the track (AA).
                color: on ? ui.ink : ui.sub,
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
