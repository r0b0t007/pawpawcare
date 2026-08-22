// expo-font (via @expo/vector-icons) requires expo-asset, which isn't a
// dependency of this app — icons don't render in Jest anyway.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

import * as components from '../index';
import { ui, type, radii, PET_COLOR_PAIRS } from '../../theme';

// Smoke test: the barrel imports every component file, so a syntax error or
// bad import in any of them fails here.
describe('component kit', () => {
  it.each([
    'Card',
    'ListRow',
    'StatusRing',
    'StatusPill',
    'Chip',
    'SegmentedControl',
    'Button',
    'Sheet',
    'ConfirmDialog',
    'UpNextCard',
    'CareStreakCard',
    'MilestoneRow',
    'ToastHost',
  ])('exports %s as a component', (name) => {
    expect(typeof components[name]).toBe('function');
  });

  it('exports showToast and the status map', () => {
    expect(typeof components.showToast).toBe('function');
    expect(Object.keys(components.PET_STATUS)).toEqual(['overdue', 'due', 'ok']);
  });
});

describe('redesign theme tokens', () => {
  it('defines the 16 spec tokens', () => {
    for (const key of [
      'background', 'surface', 'border', 'hairline',
      'ink', 'sub', 'subtle', 'accent', 'accentTint',
      'danger', 'dangerTint', 'warn', 'warnTint',
      'success', 'successTint', 'ringOk',
    ]) {
      expect(ui[key]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('pairs every pet color with a readable foreground', () => {
    expect(PET_COLOR_PAIRS).toHaveLength(5);
    for (const pair of PET_COLOR_PAIRS) {
      expect(pair.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(pair.fg).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the redesign radii and type scale', () => {
    expect(radii.card).toBe(20);
    expect(radii.control).toBe(14);
    expect(type.screenTitle.fontSize).toBe(26);
    expect(type.sectionLabel.letterSpacing).toBe(1.4);
  });
});
