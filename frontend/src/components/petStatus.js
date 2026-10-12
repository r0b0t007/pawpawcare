import { ui } from '../theme';

// The single source of truth for pet health status colors + icons. StatusRing
// renders it on avatars, StatusPill / PetCard everywhere an avatar isn't
// carrying it — never both for the same item.
export const PET_STATUS = {
  overdue: { label: 'Overdue', ring: ui.danger, bg: ui.dangerTint, fg: ui.dangerText, icon: 'alert-circle' },
  due: { label: 'Due soon', ring: ui.warn, bg: ui.warnTint, fg: ui.warnText, icon: 'clock-outline' },
  ok: { label: 'All good', ring: ui.ringOk, bg: ui.successTint, fg: ui.success, icon: 'check-circle' },
};

// Species → icon, shared by pet cards, photo-less avatars and pickers.
export const SPECIES_ICON = { dog: 'dog', cat: 'cat', bird: 'bird', rabbit: 'rabbit', other: 'paw' };
export const speciesIcon = (type) => SPECIES_ICON[type] ?? 'paw';

// Worst vaccination status wins — one rule for every screen.
export function petHealthStatus(vax = []) {
  const overdue = vax.filter((v) => v.status === 'overdue').length;
  if (overdue > 0) return { status: 'overdue', label: overdue === 1 ? 'Vaccine overdue' : `${overdue} overdue` };
  if (vax.some((v) => v.status === 'due_soon')) return { status: 'due', label: 'Due soon' };
  return { status: 'ok', label: 'All good' };
}
