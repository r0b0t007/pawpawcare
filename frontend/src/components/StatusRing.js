import React from 'react';
import { View, Text, Image } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { motion } from '../theme';
import { EASE_OUT_CSS } from './motion';
import { PET_STATUS } from './petStatus';

// Pet avatar (photo or initial on the pet's identity color) with a 3px ring
// separated by a 3px gap. With `status` the ring is the pet's health status —
// the ONLY place status is rendered next to an avatar. Without a status,
// `ringColor` draws a quiet identity ring (the pet's own tint) instead.
// `icon` (a MaterialCommunityIcons name) replaces the initial when there's no
// photo — e.g. the species glyph.
export default function StatusRing({
  size = 56,
  color = '#ffddb8',
  textColor = '#8a5300',
  initial,
  icon,
  photo,
  status, // 'overdue' | 'due' | 'ok' | undefined (no status ring)
  ringColor, // identity ring when there is no status
  style,
}) {
  const ring = status ? PET_STATUS[status]?.ring : ringColor || null;

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
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={Math.round(size * 0.54)} color={textColor} />
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
          transitionTimingFunction: EASE_OUT_CSS,
        },
        style,
      ]}
    >
      {avatar}
    </Animated.View>
  );
}
