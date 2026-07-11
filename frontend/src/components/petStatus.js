import { ui } from '../theme';

// The single source of truth for pet health status colors. StatusRing renders
// it on avatars, StatusPill everywhere an avatar isn't present — never both.
export const PET_STATUS = {
  overdue: { label: 'Overdue', ring: ui.danger, bg: ui.dangerTint, fg: ui.dangerText },
  due: { label: 'Due soon', ring: ui.warn, bg: ui.warnTint, fg: ui.warnText },
  ok: { label: 'All good', ring: ui.ringOk, bg: ui.successTint, fg: ui.success },
};
