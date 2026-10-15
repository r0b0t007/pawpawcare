// Dynamic Expo config. app.json remains the source of truth for everything
// static — it arrives here as `config` and is spread through unchanged.
//
// The only thing this file does is layer on the `e2e` build profile's needs.
// ENVIRONMENT is set per-profile in eas.json and is available when EAS
// evaluates the app config, both locally and on the builder.

const IS_E2E = process.env.ENVIRONMENT === 'e2e';

module.exports = ({ config }) => {
  if (!IS_E2E) return config;

  return {
    ...config,
    // Distinct name so an e2e build is never mistaken for the real app in the
    // launcher. The package/bundle id stays the same, so this still installs
    // over a preview build rather than sitting alongside it.
    name: 'PawPawCare (E2E)',
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            // The e2e build talks to Laravel over plain HTTP at 10.0.2.2:8080
            // (the emulator's alias for the host loopback). Android blocks
            // cleartext by default in non-debug builds, so it has to be opted
            // in — and ONLY here. Production keeps the default deny and talks
            // HTTPS to api.pawpawcare.app.
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
  };
};
