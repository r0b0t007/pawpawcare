// Runtime fingerprint settings (app.json runtimeVersion.policy = "fingerprint").
// Version numbers are left out: production builds auto-increment
// android.versionCode / ios.buildNumber, and including them gave every store
// build its own runtime, so OTA updates published from main never matched.
// Real native changes (dependencies, config plugins, native config) still
// change the fingerprint.
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.ExpoConfigVersions,
};
