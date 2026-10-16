import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/EmptyState';
import { useTranslation } from '../../i18n';
import { ui, type, motion, photos } from '../../theme';

// Shown at launch when a saved session couldn't be checked: no connection, or
// the server didn't answer (timeout, server error, rate limit). The session is still
// valid, so this is "try again", never the Welcome screen — which would read
// as being signed out. Signing out stays available as a quiet escape hatch.
export default function ReconnectScreen() {
  const { t } = useTranslation();
  const { retryRestore, logout, restoreOffline } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: ui.background,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 16,
        gap: 18,
      }}
    >
      <EmptyState
        photo={photos.emptyBlanket}
        title={t('auth.reconnect.title')}
        body={restoreOffline ? t('auth.reconnect.offline') : t('auth.reconnect.serverDown')}
        actionLabel={t('auth.reconnect.retry')}
        actionIcon="refresh"
        onAction={retryRestore}
      />
      <Pressable
        onPress={logout}
        accessibilityRole="button"
        hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
        style={({ pressed }) => [{ alignSelf: 'center', padding: 8 }, pressed && { opacity: motion.pressOpacity }]}
      >
        <Text style={[type.body, { color: ui.sub }]}>{t('auth.reconnect.signOut')}</Text>
      </Pressable>
    </View>
  );
}
