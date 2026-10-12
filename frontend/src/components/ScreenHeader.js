import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type, motion } from '../theme';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// The header of a pushed screen: a round back button, the title (a header for
// screen readers), an optional quiet subtitle, and an optional `right` slot
// for the screen's one secondary action; `avatar` sits between back and title
// (e.g. the pet's face on its vault). Same place, same size on every
// screen, so "where am I and how do I get back" never needs reading.
export default function ScreenHeader({ title, subtitle, onBack, avatar, right, style }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 16,
        },
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: ui.surface,
              borderWidth: 1,
              borderColor: ui.border,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { backgroundColor: ui.pressTint, opacity: motion.pressOpacity },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
      ) : null}
      {avatar}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.headerTitle, { color: ui.ink }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
