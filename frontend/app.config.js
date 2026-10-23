// Dynamic Expo config. app.json remains the source of truth for everything
// static — it arrives here as `config` and is spread through unchanged.
//
// The only thing this file does is layer on the `e2e` build profile's needs.
// ENVIRONMENT is set per-profile in eas.json and is available when EAS
// evaluates the app config, both locally and on the builder.

const path = require('path');

const IS_E2E = process.env.ENVIRONMENT === 'e2e';
const BUILD_PROPERTIES = 'expo-build-properties';

// The e2e build talks to Laravel over plain HTTP at 10.0.2.2:8080 (the
// emulator's alias for the host loopback). Android blocks cleartext by default
// in non-debug builds, so it has to be opted in — and ONLY here. Production
// keeps the default deny and talks HTTPS to api.pawpawcare.app.
const E2E_ANDROID = { usesCleartextTraffic: true };

// Merge into an existing expo-build-properties entry rather than appending a
// second one: two entries run the plugin twice, and the second (with only
// this flag) could reset android props app.json set, making the e2e APK
// differ natively from production.
function withE2eBuildProperties(plugins = []) {
  let merged = false;
  const next = plugins.map((plugin) => {
    const [name, options = {}] = Array.isArray(plugin) ? plugin : [plugin];
    if (name !== BUILD_PROPERTIES) return plugin;
    merged = true;
    return [name, { ...options, android: { ...options.android, ...E2E_ANDROID } }];
  });
  return merged ? next : [...next, [BUILD_PROPERTIES, { android: E2E_ANDROID }]];
}

// The translated app name in each `locales` file wins over `name` on a device
// in that language, so the e2e name goes into them too (inline objects instead
// of the file paths).
function withE2eLocaleNames(locales = {}, name) {
  return Object.fromEntries(
    Object.entries(locales).map(([lng, file]) => {
      const strings = typeof file === 'string' ? require(path.join(__dirname, file)) : file;
      return [
        lng,
        {
          ...strings,
          ios: { ...strings.ios, CFBundleDisplayName: name },
          android: { ...strings.android, app_name: name },
        },
      ];
    }),
  );
}

module.exports = ({ config }) => {
  if (!IS_E2E) return config;

  // Distinct name so an e2e build is never mistaken for the real app in the
  // launcher. The package/bundle id stays the same, so this still installs
  // over a preview build rather than sitting alongside it.
  const name = 'PawPawCare (E2E)';
  return {
    ...config,
    name,
    locales: withE2eLocaleNames(config.locales, name),
    plugins: withE2eBuildProperties(config.plugins),
  };
};
