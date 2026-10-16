import { ui } from '../theme';
import i18n from '../i18n';

// The single source of truth for pet health status colors + icons. StatusRing
// renders it on avatars, StatusPill / PetCard everywhere an avatar isn't
// carrying it — never both for the same item.
// `label` is a getter so it reads the app language at render time.
export const PET_STATUS = {
  overdue: { get label() { return i18n.t('status.overdue'); }, ring: ui.danger, bg: ui.dangerTint, fg: ui.dangerText, icon: 'alert-circle' },
  due: { get label() { return i18n.t('status.dueSoon'); }, ring: ui.warn, bg: ui.warnTint, fg: ui.warnText, icon: 'clock-outline' },
  ok: { get label() { return i18n.t('status.allGood'); }, ring: ui.ringOk, bg: ui.successTint, fg: ui.success, icon: 'check-circle' },
};

// Species → icon, shared by pet cards, photo-less avatars and pickers.
export const SPECIES_ICON = { dog: 'dog', cat: 'cat', bird: 'bird', rabbit: 'rabbit', other: 'paw' };
export const speciesIcon = (type) => SPECIES_ICON[type] ?? 'paw';

// Worst vaccination status wins — one rule for every screen.
export function petHealthStatus(vax = []) {
  const overdue = vax.filter((v) => v.status === 'overdue').length;
  if (overdue > 0) {
    return {
      status: 'overdue',
      label: overdue === 1 ? i18n.t('status.vaccineOverdue') : i18n.t('status.overdueCount', { count: overdue }),
    };
  }
  if (vax.some((v) => v.status === 'due_soon')) return { status: 'due', label: i18n.t('status.dueSoon') };
  return { status: 'ok', label: i18n.t('status.allGood') };
}
