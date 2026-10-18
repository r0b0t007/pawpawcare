import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import i18n from '../i18n';
import { getPref } from './prefs';

// expo-notifications wires its push-token machinery at import time, and since
// remote push was removed from Expo Go (SDK 53) that import THROWS there on
// Android — crashing the app before boot. Guard the require: dev/EAS builds
// get full notifications, Expo Go runs with them disabled.
let Notifications = null;
try {
  Notifications = require('expo-notifications');

  // Show reminders as banners even when the app is foregrounded.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.log('[push] expo-notifications unavailable (Expo Go) — notifications disabled');
}

const ANDROID_CHANNEL = 'reminders';

export async function ensureAndroidChannel() {
  if (Notifications && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: i18n.t('notifications.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#855300',
    });
  }
}

// The channel name shows in Android's notification settings: rename it when
// the app language changes. Only an existing channel is touched (renaming
// keeps its importance and the user's choices); a fresh install still gets
// it from registerForPushNotificationsAsync.
export async function renameAndroidChannel() {
  if (!Notifications || Platform.OS !== 'android') return;
  try {
    if (await Notifications.getNotificationChannelAsync(ANDROID_CHANNEL)) await ensureAndroidChannel();
  } catch {
    // best effort: the name catches up on the next registration
  }
}
i18n.on('languageChanged', renameAndroidChannel);

export const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * The OS permission to show notifications (CHW-230):
 * { status: 'granted' | 'denied' | 'undetermined' | 'unavailable', canAskAgain }.
 * 'unavailable' means there is no notifications module (Expo Go). canAskAgain
 * is false once the system prompt can't be shown any more (iOS after a
 * denial, Android after "Don't ask again"): only the phone's settings help.
 */
const UNAVAILABLE = { status: 'unavailable', canAskAgain: false };
const normalize = ({ status, canAskAgain }) => ({
  status,
  canAskAgain: status === 'granted' ? true : canAskAgain !== false,
});

export async function getNotificationPermission() {
  if (!Notifications) return UNAVAILABLE;
  try {
    return normalize(await Notifications.getPermissionsAsync());
  } catch {
    return UNAVAILABLE;
  }
}

/** Show the system prompt (when it still can) and return the new permission. */
export async function requestNotificationPermission() {
  if (!Notifications) return UNAVAILABLE;
  try {
    await ensureAndroidChannel(); // Android 13+ needs a channel before it prompts
    return normalize(await Notifications.requestPermissionsAsync());
  } catch {
    return getNotificationPermission();
  }
}

/**
 * Obtain an Expo push token. Returns { token, platform } or null (no
 * permission / simulator / Expo Go). It never shows the permission prompt:
 * the app asks in context (useNotificationPermission), not the moment someone
 * signs in (CHW-230).
 */
export async function registerForPushNotificationsAsync() {
  if (!Notifications) return null; // Expo Go: no notifications module at all

  await ensureAndroidChannel();

  if (!Device.isDevice) return null; // push tokens require a physical device

  if ((await getNotificationPermission()).status !== 'granted') return null;

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
  if (!Notifications) return;

  // Respect the Profile → Notifications → "Care reminders" toggle: when the
  // user turned local reminders off, never (re)schedule behind their back.
  if (!(await getPref('careReminders', true))) return;

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
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

export function addNotificationResponseListener(handler) {
  if (!Notifications) return { remove: () => {} };
  return Notifications.addNotificationResponseReceivedListener(handler);
}
