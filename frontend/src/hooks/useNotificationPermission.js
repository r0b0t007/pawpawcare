import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleLocalReminders,
} from '../services/notifications';

// The OS notification permission, shared by every screen that shows it
// (CHW-230): one value for the whole app, so a banner still mounted in another
// tab updates the moment permission changes anywhere. Read on first use and
// whenever the app comes back to the foreground (the user may have just
// changed it in the phone's settings).
//
// turnOn() shows the system prompt while the OS still allows it, and opens the
// app's page in the phone's settings once it doesn't (iOS after a denial,
// Android after "Don't ask again").
//
// The moment permission becomes granted — from the prompt or from Settings —
// this phone is registered for server pushes and the local reminders are
// scheduled (once, by whichever screen saw the change), so nothing waits for
// the next sign-in.
const UNKNOWN = { status: 'unknown', canAskAgain: true };
let shared = UNKNOWN;
const listeners = new Set();

function publish(next) {
  const was = shared.status;
  shared = next;
  listeners.forEach((listener) => listener(next));
  return was;
}

// Tests reset the shared value between cases.
export function resetNotificationPermissionForTests() {
  shared = UNKNOWN;
  listeners.clear();
}

export function useNotificationPermission() {
  const { registerPushDevice } = useAuth();
  const { reminders } = useData();
  const [permission, setPermission] = useState(shared);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const registerRef = useRef(registerPushDevice);
  registerRef.current = registerPushDevice;

  const apply = useCallback((next) => {
    const was = publish(next);
    if (next.status === 'granted' && was !== 'granted' && was !== 'unknown') {
      registerRef.current?.();
      scheduleLocalReminders(remindersRef.current || []);
    }
  }, []);

  const refresh = useCallback(() => getNotificationPermission().then(apply), [apply]);

  useEffect(() => {
    listeners.add(setPermission);
    setPermission(shared);
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      listeners.delete(setPermission);
      sub.remove();
    };
  }, [refresh]);

  const turnOn = useCallback(async () => {
    const current = shared;
    if (current.status !== 'granted' && current.canAskAgain) {
      const next = await requestNotificationPermission();
      apply(next);
      return next.status;
    }
    Linking.openSettings();
    return current.status;
  }, [apply]);

  return { ...permission, refresh, turnOn };
}
