import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { getPref, setPref } from '../services/prefs';
import { canScheduleExactAlarms, openExactAlarmSettings } from '../services/exactAlarms';
import ConfirmDialog from '../components/ConfirmDialog';
import { showToast } from '../components/Toast';
import { useNotificationPermission } from './useNotificationPermission';

const SNOOZE_KEY = 'notificationsAskSnoozedUntil';
const EXACT_SNOOZE_KEY = 'exactAlarmsAskSnoozedUntil';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
// The dialog opens once the save's own motion is over (a sheet closing, a
// new row animating in: ≤300ms each), so it never lands mid-animation.
export const PROMPT_DELAY_MS = 400;
// iOS drops a prompt presented while another modal is still dismissing.
const AFTER_DISMISS_MS = 320;

// The in-context ask (CHW-230): right after someone sets up something that
// will remind them (a reminder, a vaccine, a scheduled medication), offer to
// turn notifications on, with a sentence saying why, instead of the bare
// system prompt at sign-in. Only while the OS can still prompt. Whatever the
// answer short of "allowed" — "Not now" here, or "Don't allow" in the system
// dialog — it waits 14 days before asking again (the NotificationsBanner on
// Reminders, Notifications and Profile stays available meanwhile).
//
// Once notifications are allowed, on Android when exact alarms are blocked
// (CHW-244: Android 14+ until the user allows "Alarms & reminders"), the same
// moment offers to make reminders on time instead. "Not now" also waits 14
// days; coming back with it allowed reschedules them (NotificationPermissionWatcher).
//
//   const { maybeAsk, prompt } = useNotificationsPrompt();
//   … after a successful save: maybeAsk();   … in the tree: {prompt}
export function useNotificationsPrompt() {
  const { t } = useTranslation();
  const { status, canAskAgain, turnOn } = useNotificationPermission();
  const [visible, setVisible] = useState(null); // null | 'notifications' | 'exact'
  const openTimer = useRef(null);
  const confirmTimer = useRef(null);
  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(confirmTimer.current);
  }, []);

  const canPrompt = status === 'undetermined' || (status === 'denied' && canAskAgain);
  const snooze = (key) => setPref(key, Date.now() + SNOOZE_MS);

  const maybeAsk = useCallback(async () => {
    let which = null;
    if (canPrompt) which = 'notifications';
    else if (status === 'granted' && !canScheduleExactAlarms()) which = 'exact';
    if (!which) return false;
    const snoozedUntil = await getPref(which === 'exact' ? EXACT_SNOOZE_KEY : SNOOZE_KEY, 0);
    if (Date.now() < Number(snoozedUntil || 0)) return false;
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setVisible(which), PROMPT_DELAY_MS);
    return true;
  }, [canPrompt, status]);

  // Cleared on unmount: leaving the screen meanwhile never pops the system
  // prompt (or the phone's settings) over another screen.
  const afterDismiss = (fn) => {
    confirmTimer.current = setTimeout(fn, AFTER_DISMISS_MS);
  };

  const prompt = (
    <>
      <ConfirmDialog
        visible={visible === 'notifications'}
        title={t('notifications.permission.dialogTitle')}
        message={t('notifications.permission.dialogMessage')}
        confirmLabel={t('notifications.permission.turnOn')}
        cancelLabel={t('notifications.permission.notNow')}
        onConfirm={() => {
          setVisible(null);
          afterDismiss(async () => {
            const result = await turnOn();
            if (result.status === 'granted') return;
            snooze(SNOOZE_KEY);
            if (result.prompted && result.status === 'denied' && !result.canAskAgain) {
              showToast(t('notifications.permission.blockedToast'));
            }
          });
        }}
        onCancel={() => {
          setVisible(null);
          snooze(SNOOZE_KEY);
        }}
      />
      <ConfirmDialog
        visible={visible === 'exact'}
        title={t('notifications.exactAlarms.dialogTitle')}
        message={t('notifications.exactAlarms.dialogMessage')}
        confirmLabel={t('notifications.exactAlarms.openSettings')}
        cancelLabel={t('notifications.permission.notNow')}
        onConfirm={() => {
          setVisible(null);
          // If they come back without allowing it, the 14-day wait applies too.
          snooze(EXACT_SNOOZE_KEY);
          afterDismiss(() => openExactAlarmSettings());
        }}
        onCancel={() => {
          setVisible(null);
          snooze(EXACT_SNOOZE_KEY);
        }}
      />
    </>
  );

  return { maybeAsk, prompt };
}
