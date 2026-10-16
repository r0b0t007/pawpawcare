import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ErrorBoundary } from '../services/sentry';
import i18n from '../i18n';
import { ui, type } from '../theme';
import Card from './Card';
import Button from './Button';

// Last-resort screen when rendering throws. Sentry's ErrorBoundary reports
// the crash (through the scrubber) and "Try again" remounts the tree.
// It wraps the auth/data providers too, so a retry reloads their state instead
// of re-rendering the same bad data; callers pass onReset to clear caches that
// live outside the tree (React Query). Navigation-free and context-free: it
// renders when everything below it is gone, so it reads i18n directly.
const SUPPORT_EMAIL = 'hello@pawpawcare.app';

export function CrashFallback({ resetError }) {
  const t = (key, options) => i18n.t(key, options);
  return (
    <View
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: ui.background }}
      accessibilityRole="alert"
    >
      <Card padded style={{ gap: 14, alignItems: 'center' }}>
        <MaterialCommunityIcons name="paw-off-outline" size={36} color={ui.accent} />
        <Text style={[type.cardTitle, { color: ui.ink, textAlign: 'center' }]}>
          {t('errors.crash.title')}
        </Text>
        <Text style={[type.body, { color: ui.sub, textAlign: 'center' }]}>
          {t('errors.crash.body', { email: SUPPORT_EMAIL })}
        </Text>
        <Button label={t('errors.crash.retry')} onPress={resetError} style={{ alignSelf: 'stretch' }} />
      </Card>
    </View>
  );
}

export default function AppErrorBoundary({ children, onReset }) {
  return (
    <ErrorBoundary onReset={onReset} fallback={({ resetError }) => <CrashFallback resetError={resetError} />}>
      {children}
    </ErrorBoundary>
  );
}
