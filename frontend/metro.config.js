// Sentry's Metro config = Expo's default config plus stable debug IDs in the
// bundle and its source maps, so stack traces from store builds and OTA
// updates symbolicate in Sentry.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
