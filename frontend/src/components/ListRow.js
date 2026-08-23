import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ui, type } from '../theme';

// Standard tappable row inside a Card: icon · title/subtitle · value · chevron.
// Rows draw their own hairline divider; pass `last` on the final row.
export default function ListRow({
  icon,
  title,
  subtitle,
  value,
  right,
  chevron,
  onPress,
  last,
  style,
}) {
  const baseStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    minHeight: 52,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: ui.hairline,
  };
  const Row = onPress ? Pressable : View;
  return (
    <Row
      onPress={onPress}
      style={
        onPress
          ? ({ pressed }) => [baseStyle, pressed && { backgroundColor: ui.pressTint }, style]
          : [baseStyle, style]
      }
    >
      {icon ? <MaterialCommunityIcons name={icon} size={19} color={ui.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.rowTitle, { color: ui.ink }]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.secondary, { color: ui.sub, marginTop: 1 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {value ? <Text style={[type.secondary, { color: ui.sub }]}>{value}</Text> : null}
      {right}
      {chevron ? <MaterialCommunityIcons name="chevron-right" size={20} color={ui.faint} /> : null}
    </Row>
  );
}
