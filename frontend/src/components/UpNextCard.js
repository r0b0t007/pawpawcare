import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';
import Card from './Card';
import Button from './Button';
import StatusPill from './StatusPill';
import StatusRing from './StatusRing';

// Home hero: the single most urgent item, with its two actions — the one
// elevated card on Home. Status shows once (the pill); the avatar ring is the
// pet's identity tint, so recognition comes before reading. `note` is the
// no-shame nudge ("Let's get Biscuit's booster booked"). Pass no item for the
// "All caught up" state.
//
// item: { title, subtitle, note?, status: 'overdue'|'due', statusLabel,
//         avatarColor, avatarTextColor, initial, photo }
const SWAP_IN = FadeIn.duration(200);
const SWAP_OUT = FadeOut.duration(150);

export default function UpNextCard({ item, onDone, onReschedule, style }) {
  if (!item) {
    return (
      <Animated.View key="caught-up" entering={SWAP_IN} exiting={SWAP_OUT}>
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
      </Animated.View>
    );
  }

  return (
    <Animated.View key="task" entering={SWAP_IN} exiting={SWAP_OUT}>
      <Card padded elevated style={[{ gap: 14, padding: 18 }, style]}>
        <StatusPill status={item.status} label={item.statusLabel} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <StatusRing
            size={52}
            color={item.avatarColor}
            textColor={item.avatarTextColor}
            initial={item.initial}
            photo={item.photo}
            ringColor={item.avatarColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[type.cardTitle, { color: ui.ink }]}>{item.title}</Text>
            <Text style={[type.body, { color: ui.sub, marginTop: 2 }]}>{item.note || item.subtitle}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Mark done" icon="check" onPress={onDone} style={{ flex: 1.3 }} />
          <Button label="Reschedule" variant="ghost" onPress={onReschedule} style={{ flex: 1 }} />
        </View>
      </Card>
    </Animated.View>
  );
}
