import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ui, type } from '../../theme';
import { Card, ListRow, ConfirmDialog } from '../../components';

// The Profile tab: account card + sharing entry points + a guarded log out.
// Replaces the user card that used to live on the deleted Schedule screen.
// Phase 5 adds notification toggles, units and export.

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { invites } = useData();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[type.screenTitle, styles.title]}>Profile</Text>

        <Card style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </Card>

        <Text style={[type.sectionLabel, styles.sectionLabel]}>Sharing & data</Text>
        <Card style={styles.sectionCard}>
          <ListRow
            icon="account-group-outline"
            title="Pet sharing & invites"
            right={
              invites.length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{invites.length}</Text>
                </View>
              ) : null
            }
            chevron
            onPress={() => navigation.navigate('Invites')}
            last
          />
        </Card>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { backgroundColor: '#fff7f6' }]}
          onPress={() => setConfirmLogout(true)}
        >
          <MaterialCommunityIcons name="logout" size={18} color={ui.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>

      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        message="Your pets' records stay safe and synced."
        confirmLabel="Log out"
        destructive
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 },
  title: { color: ui.ink, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    marginBottom: 22,
    padding: 18,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22, color: ui.accent },
  userName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: ui.ink },
  userEmail: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12.5,
    color: ui.sub,
    marginTop: 1,
  },
  sectionLabel: { color: ui.subtle, marginHorizontal: 24, marginBottom: 8 },
  sectionCard: { marginHorizontal: 24, marginBottom: 22 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ui.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 11, color: ui.accent },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 28,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#f1d7d4',
    borderCurve: 'continuous',
  },
  logoutText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: ui.danger },
});
