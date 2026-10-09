import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ErrorBoundary } from '../services/sentry';
import { ui, type } from '../theme';
import Card from './Card';
import Button from './Button';

// Last-resort screen when rendering throws. Sentry's ErrorBoundary reports
// the crash (through the scrubber) and "Try again" remounts the tree.
// Deliberately navigation-free: it sits outside the navigator it protects.
export function CrashFallback({ resetError }) {
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: ui.background }}
      accessibilityRole="alert"
    >
      <Card padded style={{ gap: 14, alignItems: 'center' }}>
        <MaterialCommunityIcons name="paw-off-outline" size={36} color={ui.accent} />
        <Text style={[type.cardTitle, { color: ui.ink, textAlign: 'center' }]}>
          Something went wrong
        </Text>
        <Text style={[type.body, { color: ui.sub, textAlign: 'center' }]}>
          The app hit an unexpected error. Your pets and records are safe — try again, and
          if it keeps happening, contact support from your Profile.
        </Text>
        <Button label="Try again" onPress={resetError} style={{ alignSelf: 'stretch' }} />
      </Card>
    </View>
  );
}

export default function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary fallback={({ resetError }) => <CrashFallback resetError={resetError} />}>
      {children}
    </ErrorBoundary>
  );
}
