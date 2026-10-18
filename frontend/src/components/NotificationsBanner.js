import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../i18n';
import { ui, type, radii } from '../theme';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import Card from './Card';
import Button from './Button';
import { showToast } from './Toast';

// Says so when this phone can't show PawPawCare's notifications (CHW-230),
// on the screens about reminders. Two states:
//  - not decided yet (or Android after a first "Deny"): "Turn on reminders",
//    whose button shows the system prompt;
//  - blocked for good (iOS after a denial, Android "Don't ask again"):
//    "Notifications are off", whose button opens the phone's settings.
// Hidden when allowed, while unknown, and without a notifications module.
export default function NotificationsBanner({ style }) {
  const { t } = useTranslation();
  const { status, canAskAgain, turnOn } = useNotificationPermission();

  // Android only reveals "blocked for good" by being asked: the request then
  // returns at once with no dialog. Say so, so the tap never looks dead; the
  // banner switches to "Open settings" at the same time.
  const onPress = async () => {
    const result = await turnOn();
    if (result.prompted && result.status === 'denied' && !result.canAskAgain) {
      showToast(t('notifications.permission.blockedToast'));
    }
  };

  if (status !== 'undetermined' && status !== 'denied') return null;
  const blocked = status === 'denied' && !canAskAgain;

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.row}>
        <View style={styles.iconBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name={blocked ? 'bell-off-outline' : 'bell-ring-outline'} size={18} color={ui.accent} />
        </View>
        <View style={styles.text}>
          <Text style={[type.rowTitle, styles.title]} accessibilityRole="header">
            {blocked ? t('notifications.permission.offTitle') : t('notifications.permission.askTitle')}
          </Text>
          <Text style={[type.secondary, styles.body]}>
            {blocked ? t('notifications.permission.offBody') : t('notifications.permission.askBody')}
          </Text>
        </View>
      </View>
      <Button
        small
        label={blocked ? t('notifications.permission.openSettings') : t('notifications.permission.turnOn')}
        onPress={onPress}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.accentTint,
  },
  text: { flex: 1, gap: 2 },
  title: { color: ui.ink },
  body: { color: ui.sub },
});
