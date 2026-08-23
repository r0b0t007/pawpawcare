import React from 'react';
import { View, Text, Image } from 'react-native';
import Animated from 'react-native-reanimated';
import { motion } from '../theme';
import { PET_STATUS } from './petStatus';

// Pet avatar (photo or initial on the pet's identity color) with a 3px status
// ring separated by a 3px gap. This is the ONLY place pet health status is
// rendered next to an avatar — no dots-plus-badges anywhere else.
export default function StatusRing({
  size = 56,
  color = '#ffddb8',
  textColor = '#8a5300',
  initial,
  photo,
  status, // 'overdue' | 'due' | 'ok' | undefined (no ring)
  style,
}) {
  const ring = status ? PET_STATUS[status]?.ring : null;

  const avatar = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text
          style={{
            fontFamily: 'PlusJakartaSans_800ExtraBold',
            fontSize: Math.round(size * 0.39),
            color: textColor,
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );

  if (!ring) return <View style={style}>{avatar}</View>;

  // The ring color easing over (overdue -> ok after "Mark done") is the app's
  // most meaningful state change — never an instant swap.
  return (
    <Animated.View
      style={[
        {
          borderWidth: 3,
          borderColor: ring,
          borderRadius: 999,
          padding: 3,
          transitionProperty: 'borderColor',
          transitionDuration: motion.duration.control,
          transitionTimingFunction: motion.easeOutCss,
        },
        style,
      ]}
    >
      {avatar}
    </Animated.View>
  );
}
