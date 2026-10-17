import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { getPref, setPref } from '../services/prefs';
import ConfirmDialog from '../components/ConfirmDialog';
import { useNotificationPermission } from './useNotificationPermission';

const SNOOZE_KEY = 'notificationsAskSnoozedUntil';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
// The dialog opens once the save's own motion is over (a sheet closing, a
// new row animating in: ≤300ms each), so it never lands mid-animation.
export const PROMPT_DELAY_MS = 400;

// The in-context ask (CHW-230): right after someone creates something that
// will remind them (a reminder, a vaccine), offer to turn notifications on,
// with a sentence saying why, instead of the bare system prompt at sign-in.
// Only while the OS can still prompt; "Not now" waits 14 days before asking
// again (the screens' NotificationsBanner stays available meanwhile).
//
//   const { maybeAsk, prompt } = useNotificationsPrompt();
//   … after a successful save: maybeAsk();   … in the tree: {prompt}
export function useNotificationsPrompt() {
  const { t } = useTranslation();
  const { status, canAskAgain, turnOn } = useNotificationPermission();
  const [visible, setVisible] = useState(false);

  const canPrompt = status === 'undetermined' || (status === 'denied' && canAskAgain);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const maybeAsk = useCallback(async () => {
    if (!canPrompt) return false;
    const snoozedUntil = await getPref(SNOOZE_KEY, 0);
    if (Date.now() < Number(snoozedUntil || 0)) return false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), PROMPT_DELAY_MS);
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
        // Let the dialog's sheet finish closing first: iOS drops a prompt
        // presented while another modal is still dismissing (≤300ms).
        setTimeout(turnOn, 320);
      }}
      onCancel={() => {
        setVisible(false);
        setPref(SNOOZE_KEY, Date.now() + SNOOZE_MS);
      }}
    />
  );

  return { maybeAsk, prompt };
}
