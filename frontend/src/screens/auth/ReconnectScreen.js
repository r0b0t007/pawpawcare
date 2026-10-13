import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import EmptyState from '../../components/EmptyState';
import { ui, type, motion, photos } from '../../theme';

// Shown at launch when a saved session couldn't be checked: no connection, or
// the server didn't answer (timeout, server error, rate limit). The session is still
// valid, so this is "try again", never the Welcome screen — which would read
// as being signed out. Signing out stays available as a quiet escape hatch.
export default function ReconnectScreen() {
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
        title="Can't reach PawPawCare"
        body={
          restoreOffline
            ? "You're still signed in. Check your connection and try again."
            : "You're still signed in. Our server isn't answering right now — try again in a moment."
        }
        actionLabel="Try again"
        actionIcon="refresh"
        onAction={retryRestore}
      />
      <Pressable
        onPress={logout}
        accessibilityRole="button"
        hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
        style={({ pressed }) => [{ alignSelf: 'center', padding: 8 }, pressed && { opacity: motion.pressOpacity }]}
      >
        <Text style={[type.body, { color: ui.sub }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}
