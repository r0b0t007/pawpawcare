import React from 'react';
import { View, Text } from 'react-native';
import { ui } from '../theme';
import PetFace from './PetFace';

// A household at a glance: overlapping pet faces (photo, or species glyph on
// the pet's tint), each with a surface-coloured edge so they stay distinct,
// then "+N" for the rest. Decorative — the caller says it in words (e.g.
// "Caring for Biscuit and 3 more"), so it's hidden from screen readers.
export default function PetFaceStack({ pets = [], max = 4, size = 30, style }) {
  if (!pets.length) return null;
  const edge = { borderRadius: (size + 4) / 2, borderWidth: 2, borderColor: ui.surface };
  const overlap = { marginLeft: -Math.round(size * 0.27) };
  const extra = pets.length - max;
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center' }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {pets.slice(0, max).map((p, i) => (
        <View key={p.id} style={[edge, i > 0 && overlap]}>
          <PetFace pet={p} size={size} ring={false} glyph />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            edge,
            overlap,
            { width: size + 4, height: size + 4, backgroundColor: ui.track, alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: ui.sub }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}
