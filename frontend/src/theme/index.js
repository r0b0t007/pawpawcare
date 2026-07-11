// ── Redesign tokens (Direction 1g — "Warm & Focused") ────────────────────────
// The 16 semantic tokens from the design handoff spec, plus the interactive
// neutrals the prototype uses. Screens migrate from `colors`/`shadows` to
// these one phase at a time; the legacy exports below go away in the final
// cleanup phase. One accent color, status encoded exactly once, no shadows.

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

// Avatar identity colors — never for UI chrome. fg is the paired initial color.
export const PET_COLOR_PAIRS = [
  { bg: '#ffddb8', fg: '#8a5300' },
  { bg: '#c5e7ff', fg: '#004c6a' },
  { bg: '#d0f0c0', fg: '#1a6b3a' },
  { bg: '#ffd6e7', fg: '#96375c' },
  { bg: '#e9e2f4', fg: '#5c4a82' },
];

// ── Legacy Material-You tokens (removed once every screen is migrated) ───────

export const colors = {
  primary: '#653e00',
  onPrimary: '#ffffff',
  primaryContainer: '#855300',
  onPrimaryContainer: '#ffd09a',
  primaryFixed: '#ffddb8',
  primaryFixedDim: '#fdb965',
  onPrimaryFixed: '#2a1700',
  onPrimaryFixedVariant: '#653e00',
  secondary: '#085ac0',
  onSecondary: '#ffffff',
  secondaryContainer: '#2170e4',
  onSecondaryContainer: '#002c66',
  secondaryFixed: '#d8e2ff',
  secondaryFixedDim: '#adc6ff',
  onSecondaryFixed: '#001a42',
  onSecondaryFixedVariant: '#004395',
  tertiary: '#004c6a',
  onTertiary: '#ffffff',
  tertiaryContainer: '#1abdff',
  onTertiaryContainer: '#addeff',
  tertiaryFixed: '#c5e7ff',
  tertiaryFixedDim: '#88cffa',
  onTertiaryFixed: '#001e2d',
  onTertiaryFixedVariant: '#004c6a',
  background: '#fff8f4',
  onBackground: '#201b15',
  surface: '#f9f9ff',
  surfaceDim: '#e4d8ce',
  surfaceBright: '#fff8f4',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#fef1e7',
  surfaceContainer: '#f8ece2',
  surfaceContainerHigh: '#f2e6dc',
  surfaceContainerHighest: '#ece0d7',
  surfaceVariant: '#ece0d7',
  onSurface: '#201b15',
  onSurfaceVariant: '#514538',
  outline: '#867461',
  outlineVariant: '#d5c4b2',
  inverseSurface: '#362f29',
  inverseOnSurface: '#fbefe5',
  inversePrimary: '#fdb965',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  deepCharcoal: '#151c27',
  // Status colors
  dueSoonBg: '#fff3d0',
  dueSoonFg: '#7a5c00',
  successBg: '#d3f2e0',
  successFg: '#1a6b3a',
};

export const typography = {
  display: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -0.88,
  },
  headlineLg: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
  },
  headlineMd: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    lineHeight: 32,
  },
  titleLg: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
  },
  bodyLg: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  labelMd: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.14,
  },
  labelSm: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
};

export const spacing = {
  xs: 4,
  base: 8,
  sm: 12,
  gutter: 16,
  md: 24,
  margin: 20,
  lg: 40,
  xl: 64,
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

export const shadows = {
  card: {
    shadowColor: '#5a3500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  medium: {
    shadowColor: '#5a3500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
  },
  strong: {
    shadowColor: '#5a3500',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  nav: {
    shadowColor: '#5a3500',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 12,
  },
  button: {
    shadowColor: '#5a3500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const PET_COLORS = [
  '#ffddb8', // warm peach
  '#c5e7ff', // light blue
  '#d8e2ff', // lavender
  '#b2f2d4', // mint
  '#ffd6e7', // pink
  '#fff3b0', // yellow
  '#d0f0c0', // light green
  '#f4cccc', // light red
];
