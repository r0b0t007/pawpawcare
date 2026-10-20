import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleLocalReminders,
} from '../services/notifications';
import { canScheduleExactAlarms } from '../services/exactAlarms';

// The OS notification permission, one value for the whole app (CHW-230), so
// every banner and prompt sees the same thing the moment it changes.
//
// NotificationPermissionWatcher (mounted once at the app root) owns the only
// AppState listener: it re-reads the permission when the app comes back to
// the foreground (the user may have changed it in the phone's settings), and
// it is where a grant is acted on — this phone registered for server pushes
// and the local reminders scheduled — wherever the grant happened, even with
// no banner on screen.
const UNKNOWN = { status: 'unknown', canAskAgain: true };
let shared = UNKNOWN;
const listeners = new Set();
const onGranted = new Set();
let reading = null;

function publish(next) {
  const was = shared.status;
  shared = next;
  listeners.forEach((listener) => listener(next));
  // A known "not allowed" becoming allowed. Not 'unknown' → granted: that is
  // the first read, and sign-in / session restore already registered.
  if (next.status === 'granted' && (was === 'denied' || was === 'undetermined')) {
    onGranted.forEach((react) => react());
  }
}

export function refreshNotificationPermission() {
  if (!reading) {
    reading = getNotificationPermission()
      .then(publish)
      .finally(() => { reading = null; });
  }
  return reading;
}

// Shows the system prompt while the OS still allows it; once it doesn't (iOS
// after a denial, Android after "Don't ask again") opens the app's page in the
// phone's settings. Resolves to { status, canAskAgain, prompted }.
export async function turnOnNotifications() {
  const current = shared;
  if (current.status !== 'granted' && current.canAskAgain) {
    const next = await requestNotificationPermission();
    publish(next);
    return { ...next, prompted: true };
  }
  Linking.openSettings();
  return { ...current, prompted: false };
}

// Tests reset the shared value between cases.
export function resetNotificationPermissionForTests() {
  shared = UNKNOWN;
  reading = null;
  listeners.clear();
  onGranted.clear();
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState(shared);

  useEffect(() => {
    listeners.add(setPermission);
    setPermission(shared);
    if (shared.status === 'unknown') refreshNotificationPermission();
    return () => listeners.delete(setPermission);
  }, []);

  return { ...permission, refresh: refreshNotificationPermission, turnOn: turnOnNotifications };
}

export function NotificationPermissionWatcher() {
  const { registerPushDevice } = useAuth();
  const { reminders } = useData();
  const registerRef = useRef(registerPushDevice);
  registerRef.current = registerPushDevice;
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;

  useEffect(() => {
    const react = () => {
      registerRef.current?.();
      scheduleLocalReminders(remindersRef.current || []);
    };
    onGranted.add(react);
    refreshNotificationPermission();
    // Android exact alarms (CHW-244): reminders scheduled while they were
    // blocked stay approximate, so a grant in "Alarms & reminders" means
    // scheduling them again, now exactly.
    let exact = canScheduleExactAlarms();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshNotificationPermission();
      const now = canScheduleExactAlarms();
      if (now && !exact) scheduleLocalReminders(remindersRef.current || []);
      exact = now;
    });
    return () => {
      onGranted.delete(react);
      sub.remove();
    };
  }, []);

  return null;
}
