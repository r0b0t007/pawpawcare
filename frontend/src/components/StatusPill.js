import React from 'react';
import { View, Text } from 'react-native';
import { PET_STATUS } from './petStatus';

// Tint pill + 6px dot + label. Used only where a StatusRing avatar isn't
// present (e.g. the pet profile header).
export default function StatusPill({ status = 'ok', label, style }) {
  const s = PET_STATUS[status] ?? PET_STATUS.ok;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 4,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: s.bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.ring }} />
      <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11.5, color: s.fg }}>
        {label ?? s.label}
      </Text>
    </View>
  );
}
