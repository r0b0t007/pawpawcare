// Reanimated test hooks (jest-expo maps the native module to the JS mock;
// setUpTests wires timing so entering/exiting props don't throw).
require('react-native-reanimated').setUpTests();

// AsyncStorage has no native module under Jest; use the package's official
// in-memory mock (tests that need specific behaviour still jest.mock it).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Tests run in English unless they switch language themselves: pin the
// device locale so the i18n module (src/i18n) starts in 'en' on any machine.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [{ timeZone: 'UTC', uses24hourClock: false, firstWeekday: 1 }],
}));
