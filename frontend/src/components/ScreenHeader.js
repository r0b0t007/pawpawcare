import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type, motion } from '../theme';
import { useTranslation } from '../i18n';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// The header of a pushed screen: a round back button, the title (a header for
// screen readers), an optional quiet subtitle, and an optional `right` slot
// for the screen's one secondary action; `avatar` sits between back and title
// (e.g. the pet's face on its vault). Without a title it's just the back
// button (form screens that set their own large heading). Same place, same size on every
// screen, so "where am I and how do I get back" never needs reading.
// `flush` drops the side and top padding for screens whose scroll view
// already pads its content (form screens), instead of each overriding it.
export default function ScreenHeader({ title, subtitle, onBack, avatar, right, flush, style }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: flush ? 0 : 24,
          paddingTop: flush ? 0 : 12,
          paddingBottom: 16,
        },
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: ui.surface,
              borderWidth: 1,
              borderColor: ui.border,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { backgroundColor: ui.pressTint, opacity: motion.pressOpacity },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={19} color={ui.ink} />
        </Pressable>
      ) : null}
      {avatar}
      {title ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Two lines, not one: at large system font sizes a title wraps
              instead of being cut to "Help & fe…". */}
          <Text style={[type.headerTitle, { color: ui.ink }]} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}
