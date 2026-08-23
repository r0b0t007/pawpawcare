import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';
import Card from './Card';

// "Your week in care" — trailing-7-day recap, shown on the Dashboard around
// the week boundary (Sun–Mon). Reflection, not judgment: renders nothing when
// there is nothing to say, and a quiet week with healthy pets reads as calm,
// never as failure (Warm & Focused).
//
// rows: [{ petId, petName, doses, weights, activities, vaxCurrent }]
export default function RecapCard({ rows, style }) {
  const withNames = (rows || []).filter((r) => r && r.petName);
  const total = withNames.reduce((n, r) => n + r.doses + r.weights + r.activities, 0);
  // Render whenever the Sunday recap push would have fired: some care was
  // logged OR something needs a look. A push must never deep-link to nothing.
  const needsLook = withNames.some((r) => !r.vaxCurrent);
  if (!withNames.length || (total === 0 && !needsLook)) return null;

  const parts = (r) => {
    const p = [];
    if (r.doses) p.push(`${r.doses} dose${r.doses === 1 ? '' : 's'}`);
    if (r.weights) p.push(`${r.weights} weight ${r.weights === 1 ? 'entry' : 'entries'}`);
    if (r.activities) p.push(`${r.activities} activit${r.activities === 1 ? 'y' : 'ies'}`);
    return p.join(', ');
  };

  return (
    <Card padded style={[{ gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialCommunityIcons name="notebook-heart-outline" size={16} color={ui.accent} />
        <Text style={[type.sectionLabel, { color: ui.subtle }]}>Your week in care</Text>
      </View>
      {withNames.map((r) => {
        const line = parts(r);
        if (!line && r.vaxCurrent) return null; // nothing logged, nothing due — calm
        return (
          <View key={r.petId} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={[type.rowTitle, { color: ui.ink }]}>{r.petName}</Text>
            <Text style={[type.secondary, { color: ui.sub, flex: 1 }]}>
              {line || 'vaccinations could use a look'}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
