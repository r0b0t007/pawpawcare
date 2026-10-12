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
    'RecapCard',
    'PetCard',
    'PetFace',
    'EmptyState',
    'StepProgress',
    'ScreenHeader',
    'PetFaceStack',
    'DeleteButton',
    'Toggle',
    'PhotoBand',
    'FormError',
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

// Regression: Reanimated's CSS engine accepts keyword strings or cubicBezier()
// objects — a 'cubic-bezier(...)' STRING passes every static check but throws
// "Invalid predefined timing function" at mount on device (crashed build
// b6c78ec0 on the login screen).
describe('motion easings', () => {
  it('CSS easings are parametrized objects the native validator accepts', () => {
    const { EASE_OUT_CSS, EASE_IN_OUT_CSS } = require('../motion');
    for (const easing of [EASE_OUT_CSS, EASE_IN_OUT_CSS]) {
      expect(typeof easing.normalize).toBe('function');
      expect(() => easing.normalize()).not.toThrow();
    }
  });

  it('no source file uses a cubic-bezier string as a CSS timing function', () => {
    const fs = require('fs');
    const path = require('path');
    const offenders = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js') && /TimingFunction:\s*['"`]cubic-bezier/.test(fs.readFileSync(p, 'utf8'))) {
          offenders.push(p);
        }
      }
    };
    walk(path.join(__dirname, '..', '..'));
    expect(offenders).toEqual([]);
  });
});

describe('shared form + header pieces', () => {
  it('exports TextField as a ref-forwarding component', () => {
    const { TextField } = require('../index');
    expect(TextField).toBeTruthy();
    expect(TextField.$$typeof).toBe(Symbol.for('react.forward_ref'));
  });

  it('maps reminder types to icons with a bell fallback', () => {
    const { reminderIcon, REMINDER_ICON } = require('../index');
    expect(reminderIcon('vaccination')).toBe(REMINDER_ICON.vaccination);
    expect(reminderIcon('medication')).toBe('pill');
    expect(reminderIcon('something-new')).toBe('bell-outline');
    expect(reminderIcon(undefined)).toBe('bell-outline');
  });
});
