import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, radii } from '../theme';

// A form's one error line: icon + words on the danger tint, announced to
// screen readers when it appears. Copy should say what to do next, never
// whose fault it was. Renders nothing without a message.
export default function FormError({ message, style }) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: radii.md,
          borderCurve: 'continuous',
          backgroundColor: ui.dangerTint,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="information-outline" size={18} color={ui.dangerText} />
      <Text
        selectable
        style={{ flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13.5, lineHeight: 19, color: ui.dangerText }}
      >
        {message}
      </Text>
    </View>
  );
}
