// Design tokens — Direction 1g "Warm & Focused" (see PawPawCare Handoff Spec).
// One accent color, status encoded exactly once, 1px borders instead of
// shadows. The legacy Material-You palette was removed once every screen
// migrated to these tokens.

export const ui = {
  background: '#fffaf6',
  surface: '#ffffff',
  border: '#eee2d3', // card edge — replaces all shadows
  hairline: '#f4ecdf', // row divider
  ink: '#241a0e', // headings, primary text
  sub: '#6f604c', // body-secondary
  subtle: '#8a6f4d', // section labels
  accent: '#8a5300', // THE brand color — buttons, active tab, links
  accentTint: '#ffddb8',
  danger: '#ba1a1a', // overdue, destructive confirm
  dangerTint: '#ffdad6',
  warn: '#d4a000', // due soon
  warnTint: '#fff3d0',
  success: '#1a6b3a', // all good
  successTint: '#e6f4ea',
  ringOk: '#7cbf8e',
  // Interactive neutrals
  controlBorder: '#e3d5c2', // chip / ghost-button outline
  track: '#f3ead9', // segmented track, dialog cancel button
  faint: '#cbb897', // chevrons, dashed add-outline
  dangerText: '#93000a', // text on dangerTint
  warnText: '#7a5c00', // text on warnTint
};

// Type scale from the spec: screen title 26/800 · card title 17–19/700 ·
// body 14/400 · row secondary 12/400 · section label 11/700 caps · button 14/700.
export const type = {
  screenTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  cardTitleSm: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
    lineHeight: 22,
  },
  rowTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
  },
  body: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  secondary: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  sectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
};

export const radii = {
  sm: 6,
  DEFAULT: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  full: 9999,
  // Redesign scale
  card: 20,
  control: 14,
  thumb: 11,
  dialog: 22,
  sheet: 28,
};

// Avatar identity colors — never for UI chrome. fg is the paired initial color.
export const PET_COLOR_PAIRS = [
  { bg: '#ffddb8', fg: '#8a5300' },
  { bg: '#c5e7ff', fg: '#004c6a' },
  { bg: '#d0f0c0', fg: '#1a6b3a' },
  { bg: '#ffd6e7', fg: '#96375c' },
  { bg: '#e9e2f4', fg: '#5c4a82' },
];
