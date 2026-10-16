import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';
import Card from './Card';
import { useTranslation } from '../i18n';

// Dashboard household view of the per-pet weekly care streaks. Restrained by
// design (Warm & Focused): accent number, plain rows, no flames or red — a
// broken streak reads as a fresh start, never a failure.
//
// streaks: [{ petId, petName, currentWeeks, longestWeeks }] — already joined
// with pet names by the screen. Render nothing when there are no streaks yet.
export default function CareStreakCard({ streaks, style }) {
  const { t } = useTranslation();
  const active = (streaks || []).filter((s) => s && s.petName);
  if (!active.length) return null;

  return (
    <Card padded style={[{ gap: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialCommunityIcons name="calendar-heart" size={16} color={ui.accent} />
        <Text style={[type.sectionLabel, { color: ui.subtle }]}>{t('gamification.careStreaks.title')}</Text>
      </View>
      {active.map((s) => (
        <View
          key={s.petId}
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Text style={[type.rowTitle, { color: ui.ink }]}>{s.petName}</Text>
          {s.currentWeeks > 0 ? (
            <Text style={[type.rowTitle, { color: ui.accent }]}>
              {t('gamification.careStreaks.weeks', { count: s.currentWeeks })}
            </Text>
          ) : (
            // Recovery framing — acknowledge history without shaming the gap.
            <Text style={[type.secondary, { color: ui.sub }]}>
              {s.longestWeeks > 0 ? t('gamification.careStreaks.freshStart') : t('gamification.careStreaks.firstEntry')}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}
