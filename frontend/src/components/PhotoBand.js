import React from 'react';
import { View, Image } from 'react-native';
import { ui, radii } from '../theme';

// A short, rounded photo strip — decorative warmth on form screens (log in,
// sign up), kept low so the form stays above the keyboard. Hidden from screen
// readers: it carries no information.
export default function PhotoBand({ source, height = 120, style }) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: radii.xl,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: ui.accentTint,
        },
        style,
      ]}
    >
      <Image
        source={source}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        importantForAccessibility="no"
        // Explicit 100% box, not absoluteFill (react-native-web sizes an
        // absoluteFill <Image> at its natural size).
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}
