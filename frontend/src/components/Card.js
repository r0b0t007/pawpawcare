import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ui, radii, elevation } from '../theme';

// Outer-box props go on the shadow wrapper of an elevated card; everything
// else (padding, layout, colors) stays on the clipped surface.
const OUTER = /^(margin|position|top|bottom|left|right|zIndex|alignSelf|flex$|flexGrow|flexShrink|flexBasis|width|maxWidth|minWidth)/;

// Surface + radius 20 + 1px border — the border is the elevation. `elevated`
// cards (the one hero card on a screen, photo cards) add the single soft
// shadow level. The shadow sits on an outer view because overflow: 'hidden'
// (needed to clip photos to the radius) would clip it.
export default function Card({ padded, elevated, style, children, ...rest }) {
  const surface = [
    {
      backgroundColor: ui.surface,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: ui.border,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    padded && { padding: 22 },
  ];

  if (!elevated) {
    return (
      <View style={[...surface, style]} {...rest}>
        {children}
      </View>
    );
  }

  const outer = {};
  const inner = {};
  for (const [k, v] of Object.entries(StyleSheet.flatten(style) || {})) {
    (OUTER.test(k) ? outer : inner)[k] = v;
  }
  return (
    <View
      style={[
        {
          borderRadius: inner.borderRadius ?? radii.card,
          borderCurve: 'continuous',
          boxShadow: elevation.card,
        },
        outer,
      ]}
    >
      <View style={[...surface, inner, (outer.flex || outer.flexGrow) && { flex: 1 }]} {...rest}>
        {children}
      </View>
    </View>
  );
}
