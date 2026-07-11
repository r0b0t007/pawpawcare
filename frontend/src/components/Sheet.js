import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui, type, radii } from '../theme';

// Bottom sheet: dim backdrop (tap to close), radius-28 top corners, drag handle.
export default function Sheet({ visible, onClose, title, children, style }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(36, 26, 14, 0.35)' }]}
          onPress={onClose}
        />
        <View
          style={[
            {
              backgroundColor: ui.surface,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              borderCurve: 'continuous',
              paddingTop: 14,
              paddingHorizontal: 24,
              paddingBottom: Math.max(30, insets.bottom + 14),
              gap: 16,
            },
            style,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: ui.controlBorder,
            }}
          />
          {title ? <Text style={[type.cardTitle, { color: ui.ink }]}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
