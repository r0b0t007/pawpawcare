import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PET_STATUS } from './petStatus';

// Tint pill + icon + word — status is never color alone (colour-blind safe).
// Used wherever a StatusRing avatar isn't carrying the status.
export default function StatusPill({ status = 'ok', label, style }) {
  const s = PET_STATUS[status] ?? PET_STATUS.ok;
  return (
    <View
      accessible
      accessibilityLabel={label ?? s.label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingVertical: 4,
          paddingLeft: 8,
          paddingRight: 11,
          borderRadius: 999,
          backgroundColor: s.bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name={s.icon} size={13} color={s.fg} />
      <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5, color: s.fg }}>
        {label ?? s.label}
      </Text>
    </View>
  );
}
