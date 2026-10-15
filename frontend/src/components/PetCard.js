import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, radii, motion, petPair } from '../theme';
import { EASE_OUT_CSS } from './motion';
import { PET_STATUS, speciesIcon } from './petStatus';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// A pet as a photo card on its own identity tint — recognised by face and
// color before the name is read. Status, when passed, renders exactly once
// as icon + word on the white strip (never color alone). Without a photo the
// card shows the species glyph on the tint — never stock imagery, which must
// not pass for the user's own pet.
//
// width: number for horizontal rows; omit to fill a grid cell (flex: 1).
export default function PetCard({
  name,
  meta,
  color,
  photo,
  species,
  status,
  statusLabel,
  onPress,
  disabled = false,
  width,
  photoHeight = 128,
  style,
}) {
  const pair = petPair(color);
  const s = status ? PET_STATUS[status] : null;
  const [pressed, setPressed] = useState(false);

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={[name, meta, s && (statusLabel ?? s.label)].filter(Boolean).join(', ')}
      style={[
        {
          backgroundColor: pair.bg,
          borderRadius: 22,
          borderCurve: 'continuous',
          padding: 8,
          gap: 8,
          transform: [{ scale: pressed ? motion.pressScale : 1 }],
          transitionProperty: 'transform',
          transitionDuration: motion.duration.press,
          transitionTimingFunction: EASE_OUT_CSS,
        },
        width ? { width } : { flex: 1 },
        style,
      ]}
    >
      <View
        style={{
          height: photoHeight,
          borderRadius: 16,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: ui.glassSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {photo ? (
          <>
            <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} />
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: ui.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={speciesIcon(species)} size={16} color={pair.fg} />
            </View>
          </>
        ) : (
          <MaterialCommunityIcons
            name={speciesIcon(species)}
            size={Math.round(photoHeight * 0.42)}
            color={pair.fg}
          />
        )}
      </View>

      <View style={{ paddingHorizontal: 6, paddingBottom: s ? 0 : 6 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, lineHeight: 22, color: ui.ink }}
        >
          {name}
        </Text>
        {meta ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 17, color: pair.fg }}
          >
            {meta}
          </Text>
        ) : null}
      </View>

      {s ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: ui.surface,
            borderRadius: radii.control - 2,
            borderCurve: 'continuous',
            paddingVertical: 7,
            paddingHorizontal: 9,
          }}
        >
          <MaterialCommunityIcons name={s.icon} size={15} color={status === 'overdue' ? ui.danger : s.fg} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: s.fg }}
          >
            {statusLabel ?? s.label}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
