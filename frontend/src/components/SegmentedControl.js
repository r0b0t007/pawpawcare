import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ui, radii } from '../theme';

// Tint track + white raised thumb. `segments` is [{ value, label }].
export default function SegmentedControl({ segments, value, onChange, style }) {
  return (
    <View
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
      {segments.map((seg) => {
        const on = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 9,
              borderRadius: radii.thumb,
              backgroundColor: on ? ui.surface : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(60, 40, 10, 0.08)' : undefined,
            }}
          >
            <Text
              style={{
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 13,
                color: on ? ui.ink : ui.subtle,
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
