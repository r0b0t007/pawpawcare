import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Android exact alarms (CHW-244). Without them Android may deliver a
// reminder's local notification up to an hour late; expo-notifications
// already schedules exactly when they're allowed. The native side is the
// local module in modules/exact-alarms. It's absent on iOS, in Jest and in
// builds made before it, so everything here falls back to "nothing to do".
const ExactAlarms = Platform.OS === 'android' ? requireOptionalNativeModule('ExactAlarms') : null;

/** False only when Android is blocking exact alarms for this app. */
export function canScheduleExactAlarms() {
  try {
    return ExactAlarms ? ExactAlarms.canScheduleExactAlarms() !== false : true;
  } catch {
    return true;
  }
}

/** Open this app's "Alarms & reminders" page. False when there's none. */
export function openExactAlarmSettings() {
  try {
    return ExactAlarms ? ExactAlarms.openSettings() === true : false;
  } catch {
    return false;
  }
}
