import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';
import Card from './Card';
import Button from './Button';
import StatusRing from './StatusRing';

// Home hero: the single most urgent item, with its two actions. Pass no item
// for the "All caught up" empty state.
//
// item: { title, subtitle, status: 'overdue'|'due', statusLabel,
//         avatarColor, avatarTextColor, initial, photo }
export default function UpNextCard({ item, onDone, onReschedule, style }) {
  if (!item) {
    return (
      <Card
        padded
        style={[
          { borderColor: '#d9ead9', flexDirection: 'row', alignItems: 'center', gap: 14 },
          style,
        ]}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: ui.successTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="check-circle" size={24} color={ui.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.cardTitleSm, { color: ui.ink }]}>All caught up</Text>
          <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: ui.sub, marginTop: 2 }}>
            Nothing needs attention right now
          </Text>
        </View>
      </Card>
    );
  }

  const statusColor = item.status === 'overdue' ? ui.danger : ui.warnText;

  return (
    <Card padded style={[{ gap: 16 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.sectionLabel, { color: ui.subtle }]}>Up next</Text>
        <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: statusColor }}>
          {item.statusLabel}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <StatusRing
          size={52}
          color={item.avatarColor}
          textColor={item.avatarTextColor}
          initial={item.initial}
          photo={item.photo}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.cardTitle, { color: ui.ink }]}>{item.title}</Text>
          <Text style={[type.body, { color: ui.sub, marginTop: 2 }]}>{item.subtitle}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Mark done" onPress={onDone} style={{ flex: 1 }} />
        <Button label="Reschedule" variant="ghost" onPress={onReschedule} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
