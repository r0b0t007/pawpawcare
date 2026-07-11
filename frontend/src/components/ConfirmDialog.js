import React from 'react';
import { Modal, View, Text } from 'react-native';
import { ui, radii } from '../theme';
import Button from './Button';

// 280-wide centered dialog. Destructive confirms get the danger button —
// every delete in the app goes through this, never a bare trash icon.
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(36, 26, 14, 0.4)',
        }}
      >
        <View
          style={{
            width: 280,
            backgroundColor: ui.surface,
            borderRadius: radii.dialog,
            borderCurve: 'continuous',
            padding: 24,
            gap: 8,
          }}
        >
          <Text style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17, color: ui.ink }}>
            {title}
          </Text>
          {message ? (
            <Text
              style={{
                fontFamily: 'PlusJakartaSans_400Regular',
                fontSize: 13,
                lineHeight: 19,
                color: ui.sub,
              }}
            >
              {message}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Button small variant="soft" label={cancelLabel} onPress={onCancel} style={{ flex: 1 }} />
            <Button
              small
              variant={destructive ? 'danger' : 'primary'}
              label={confirmLabel}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
