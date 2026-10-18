import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { getPref, setPref } from '../services/prefs';
import ConfirmDialog from '../components/ConfirmDialog';
import { showToast } from '../components/Toast';
import { useNotificationPermission } from './useNotificationPermission';

const SNOOZE_KEY = 'notificationsAskSnoozedUntil';
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
//   const { maybeAsk, prompt } = useNotificationsPrompt();
//   … after a successful save: maybeAsk();   … in the tree: {prompt}
export function useNotificationsPrompt() {
  const { t } = useTranslation();
  const { status, canAskAgain, turnOn } = useNotificationPermission();
  const [visible, setVisible] = useState(false);
  const openTimer = useRef(null);
  const confirmTimer = useRef(null);
  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(confirmTimer.current);
  }, []);

  const canPrompt = status === 'undetermined' || (status === 'denied' && canAskAgain);
  const snooze = () => setPref(SNOOZE_KEY, Date.now() + SNOOZE_MS);

  const maybeAsk = useCallback(async () => {
    if (!canPrompt) return false;
    const snoozedUntil = await getPref(SNOOZE_KEY, 0);
    if (Date.now() < Number(snoozedUntil || 0)) return false;
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
    return true;
  }, [canPrompt]);

  const prompt = (
    <ConfirmDialog
      visible={visible}
      title={t('notifications.permission.dialogTitle')}
      message={t('notifications.permission.dialogMessage')}
      confirmLabel={t('notifications.permission.turnOn')}
      cancelLabel={t('notifications.permission.notNow')}
      onConfirm={() => {
        setVisible(false);
        // Cleared on unmount: leaving the screen meanwhile never pops the
        // system prompt (or the phone's settings) over another screen.
        confirmTimer.current = setTimeout(async () => {
          const result = await turnOn();
          if (result.status === 'granted') return;
          snooze();
          if (result.prompted && result.status === 'denied' && !result.canAskAgain) {
            showToast(t('notifications.permission.blockedToast'));
          }
        }, AFTER_DISMISS_MS);
      }}
      onCancel={() => {
        setVisible(false);
        snooze();
      }}
    />
  );

  return { maybeAsk, prompt };
}
