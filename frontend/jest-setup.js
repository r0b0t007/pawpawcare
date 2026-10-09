// Reanimated test hooks (jest-expo maps the native module to the JS mock;
// setUpTests wires timing so entering/exiting props don't throw).
require('react-native-reanimated').setUpTests();

// AsyncStorage has no native module under Jest; use the package's official
// in-memory mock (tests that need specific behaviour still jest.mock it).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
