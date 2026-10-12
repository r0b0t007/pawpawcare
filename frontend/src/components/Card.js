import React from 'react';
import { View } from 'react-native';
import { ui, radii, elevation } from '../theme';

// Surface + radius 20 + 1px border — the border is the elevation. `elevated`
// cards (the one hero card on a screen, photo cards) add the single soft
// shadow level instead of clipping: overflow: 'hidden' would cut the shadow,
// so media inside an elevated card clips itself (see LostPetCard's photo).
// One view either way, so opacity/transform/layout styles move the shadow too.
export default function Card({ padded, elevated, style, children, ...rest }) {
  return (
    <View
      style={[
        {
          backgroundColor: ui.surface,
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: ui.border,
          borderCurve: 'continuous',
        },
        elevated ? { boxShadow: elevation.card } : { overflow: 'hidden' },
        padded && { padding: 22 },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
