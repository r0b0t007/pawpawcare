import React from 'react';
import { View } from 'react-native';
import { ui, radii } from '../theme';

// Surface + radius 20 + 1px border. No shadow — the border is the elevation.
export default function Card({ padded, style, children, ...rest }) {
  return (
    <View
      style={[
        {
          backgroundColor: ui.surface,
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: ui.border,
          borderCurve: 'continuous',
          overflow: 'hidden',
        },
        padded && { padding: 22 },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
