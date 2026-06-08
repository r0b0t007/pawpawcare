import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// Show reminders as banners even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL = 'reminders';

export async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#855300',
    });
  }
}

export const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * Request permission and obtain an Expo push token.
 * Returns { token, platform } or null (denied / simulator / Expo Go).
 */
export async function registerForPushNotificationsAsync() {
  await ensureAndroidChannel();

  if (!Device.isDevice) return null; // push tokens require a physical device

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { token: tokenData.data, platform: Device.osName ?? Platform.OS };
  } catch (e) {
    // Expo Go (SDK 53+) can't get remote push tokens — local notifications still work.
    console.log('[push] token unavailable:', e?.message);
    return null;
  }
}

/**
 * Reconcile on-device local notifications against the server's reminder list.
 * This is the primary, timezone-correct, offline delivery path. Past-due
 * occurrences are skipped — the server push job handles those as a backstop.
 */
export async function scheduleLocalReminders(reminders = []) {
  try {
    await ensureAndroidChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = Date.now();
    // iOS caps pending local notifications at ~64 — schedule the soonest ones.
    const upcoming = reminders
      .filter((r) => r?.enabled && r?.next_fire_at && new Date(r.next_fire_at).getTime() > now)
      .sort((a, b) => new Date(a.next_fire_at) - new Date(b.next_fire_at))
      .slice(0, 60);

    for (const r of upcoming) {
      const when = new Date(r.next_fire_at).getTime();

      await Notifications.scheduleNotificationAsync({
        identifier: `${r.id}:${r.next_fire_at}`,
        content: {
          title: r.title,
          body: r.body ?? '',
          data: { reminderId: r.id, petId: r.pet_id, screen: 'Notifications' },
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(when),
        },
      });
    }
  } catch (e) {
    console.log('[push] schedule error:', e?.message);
  }
}

export async function cancelAllLocalReminders() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
