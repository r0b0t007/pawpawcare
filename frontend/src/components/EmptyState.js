import React from 'react';
import { View, Text, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type, PET_COLOR_PAIRS } from '../theme';
import Button from './Button';

// Rose, sky and leaf from the pet identity pairs — never hard-coded copies.
const FLOATERS = [
  { icon: 'paw', ...PET_COLOR_PAIRS[3], size: 44, pos: { top: 0, right: 0 } },
  { icon: 'heart', ...PET_COLOR_PAIRS[1], size: 36, pos: { bottom: 14, left: 0 } },
  { icon: 'bone', ...PET_COLOR_PAIRS[2], size: 32, pos: { bottom: 0, right: 12 } },
];

// An empty screen is the start of something, not a dead end: a warm pet
// photo, one sentence, and at most one action. `photo` is a stock image
// (theme `photos`) — decorative, so it's hidden from screen readers.
// `compact` shrinks it for empty sections inside a scrolling screen.
export default function EmptyState({
  photo,
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  compact,
  children,
  style,
}) {
  const size = compact ? 112 : 188;
  const blob = size + (compact ? 24 : 40);

  return (
    <View style={[{ alignItems: 'center', gap: compact ? 10 : 14 }, style]}>
      {photo ? (
        <View
          style={{ width: blob + 24, height: blob, alignItems: 'center', justifyContent: 'center' }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View
            style={{
              position: 'absolute',
              width: blob,
              height: blob,
              borderRadius: blob / 2,
              backgroundColor: ui.accentTint,
            }}
          />
          <Image
            source={photo}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: compact ? 3 : 5,
              borderColor: ui.surface,
            }}
          />
          {!compact &&
            FLOATERS.map((f) => (
              <View
                key={f.icon}
                style={{
                  position: 'absolute',
                  ...f.pos,
                  width: f.size,
                  height: f.size,
                  borderRadius: f.size / 2,
                  backgroundColor: f.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: ui.background,
                }}
              >
                <MaterialCommunityIcons name={f.icon} size={Math.round(f.size * 0.5)} color={f.fg} />
              </View>
            ))}
        </View>
      ) : null}
      <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
        <Text
          style={[
            compact ? type.cardTitleSm : { ...type.cardTitle, fontSize: 22, lineHeight: 28 },
            { color: ui.ink, textAlign: 'center' },
          ]}
        >
          {title}
        </Text>
        {body ? (
          <Text style={[type.body, { color: ui.sub, textAlign: 'center', fontSize: compact ? 13 : 15, lineHeight: compact ? 19 : 22 }]}>
            {body}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Button
          label={actionLabel}
          icon={actionIcon}
          onPress={onAction}
          pill={compact}
          style={compact ? undefined : { alignSelf: 'stretch', marginTop: 6 }}
        />
      ) : null}
      {children}
    </View>
  );
}
