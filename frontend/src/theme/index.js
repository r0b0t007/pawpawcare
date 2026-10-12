// Design tokens — "Lively & Light" (docs/redesign-prompt.md), built on
// Direction 1g "Warm & Focused". Still one accent for actions and status
// encoded exactly once (icon + word); what changed: pet identity color pairs
// tint pet surfaces, real photography, and ONE soft shadow level (`elevation`)
// for hero and photo cards only — every other surface keeps its 1px border.

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
  pressTint: '#fffdf8', // row pressed-state background
  dangerPressTint: '#fff7f6', // danger row pressed-state background
  // "Lively & Light" additions
  onAccent: '#ffffff', // text/icons on accent fills and over photos
  selectedTint: '#faf1e2', // selected chip background
  successBorder: '#d9ead9', // "All caught up" card edge
  glass: 'rgba(255, 255, 255, 0.92)', // pills and buttons floating on photos
  glassSoft: 'rgba(255, 255, 255, 0.45)', // quiet badge on a pet tint
  overlay: 'rgba(36, 26, 14, 0.4)', // modal backdrop
};

// Photo scrims (LinearGradient color stops), so text stays legible over any
// photo: ink fading down from the top, ink rising from the bottom, and the
// cream background fading out of a photo-less hero.
export const scrim = {
  top: ['rgba(36, 26, 14, 0.35)', 'rgba(36, 26, 14, 0)'],
  bottom: ['rgba(36, 26, 14, 0)', 'rgba(36, 26, 14, 0.78)'],
  cream: ['rgba(255, 250, 246, 0.55)', 'rgba(255, 250, 246, 0)'],
};

// Type scale from the spec: screen title 26/800 · card title 17–19/700 ·
// body 14/400 · row secondary 12/400 · section label 11/700 caps · button 14/700.
export const type = {
  // Pet names over photos (profile hero) and onboarding headlines.
  display: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  screenTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  // Pushed-screen header next to the back button.
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
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

// Pet identity colors — tint that pet's cards, avatar ring and header, never
// UI chrome or actions. fg is the paired text/icon color (AA on bg).
export const PET_COLOR_PAIRS = [
  { bg: '#ffddb8', fg: '#8a5300' },
  { bg: '#c5e7ff', fg: '#004c6a' },
  { bg: '#d0f0c0', fg: '#1a6b3a' },
  { bg: '#ffd6e7', fg: '#96375c' },
  { bg: '#e9e2f4', fg: '#5c4a82' },
];

// The pair for a pet's stored color (falls back to peach for legacy colors).
export const petPair = (bg) => PET_COLOR_PAIRS.find((p) => p.bg === bg) ?? PET_COLOR_PAIRS[0];

// One soft, warm shadow level — hero cards, photo cards and a floating
// action (which needs to lift off the content it floats over). Nothing else.
export const elevation = {
  card: '0 6px 18px rgba(90, 58, 16, 0.09)',
};

// Decorative stock photography (Unsplash, see assets/images/CREDITS.md).
// Never presented as the user's own pet — a user's photo always wins.
export const photos = {
  welcomeHero: require('../../assets/images/welcome-hero.jpg'),
  speciesDog: require('../../assets/images/species-dog.jpg'),
  speciesCat: require('../../assets/images/species-cat.jpg'),
  emptyKitten: require('../../assets/images/empty-kitten.jpg'),
  emptyBlanket: require('../../assets/images/empty-blanket.jpg'),
  successHug: require('../../assets/images/success-hug.jpg'),
  communityPals: require('../../assets/images/community-pals.jpg'),
};

// Motion scale — animate-expo pass. Durations in ms.
export const motion = {
  pressScale: 0.97,
  pressOpacity: 0.7, // bare pressables: icons, text links, back buttons
  pressOpacitySoft: 0.85, // filled buttons, cards

  duration: { press: 120, control: 200, toast: 250, sheet: 300 },
  // Easings live in components/motion.js — Reanimated CSS styles need its
  // cubicBezier objects (EASE_OUT_CSS), never a 'cubic-bezier(...)' string.
};
