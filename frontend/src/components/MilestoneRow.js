import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';

// One earned milestone badge in a PetProfile list — permanent, quiet, 1px
// design language (no medal artwork). `label` comes from milestoneLabel();
// `earnedAt` is an ISO string.
export default function MilestoneRow({ label, earnedAt, last }) {
  const dateLabel = earnedAt
    ? new Date(earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: ui.hairline,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: ui.accentTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name="star-four-points" size={15} color={ui.accent} />
      </View>
      <Text style={[type.rowTitle, { color: ui.ink, flex: 1 }]}>{label}</Text>
      {dateLabel && <Text style={[type.secondary, { color: ui.subtle }]}>{dateLabel}</Text>}
    </View>
  );
}
