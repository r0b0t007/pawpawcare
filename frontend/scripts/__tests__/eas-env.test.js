const fs = require('fs');
const path = require('path');
const { publicEnv, toDotenv } = require('../eas-env');

const REPO = path.resolve(__dirname, '../../..');
const easJson = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/eas.json'), 'utf8'));

// eas.json profile -> workflow that publishes OTA updates to its channel.
const OTA_WORKFLOWS = {
  production: '.github/workflows/ota-update.yml',
  preview: '.github/workflows/preview-build.yml',
};

describe('eas-env', () => {
  test('emits only EXPO_PUBLIC_* entries as .env lines', () => {
    const env = publicEnv({ build: { p: { env: { ENVIRONMENT: 'x', EXPO_PUBLIC_A: '1', EXPO_PUBLIC_B: 'two' } } } }, 'p');
    expect(env).toEqual({ EXPO_PUBLIC_A: '1', EXPO_PUBLIC_B: 'two' });
    expect(toDotenv(env)).toBe('EXPO_PUBLIC_A=1\nEXPO_PUBLIC_B=two\n');
  });

  test('fails loudly instead of writing an empty or broken value', () => {
    expect(() => publicEnv({ build: {} }, 'production')).toThrow('no build profile "production"');
    expect(() => publicEnv({ build: { p: { env: { ENVIRONMENT: 'x' } } } }, 'p')).toThrow('sets no EXPO_PUBLIC_* vars');
    expect(() => publicEnv({ build: { p: { env: { EXPO_PUBLIC_A: ' ' } } } }, 'p')).toThrow('empty EXPO_PUBLIC_A');
    expect(() => publicEnv({ build: { p: { env: { EXPO_PUBLIC_A: 'a\nEXPO_PUBLIC_B=evil' } } } }, 'p')).toThrow('newline');
  });

  test('production ships the API URL and the PostHog key; preview stays out of analytics', () => {
    const production = publicEnv(easJson, 'production');
    expect(production.EXPO_PUBLIC_API_URL).toBe('https://api.pawpawcare.app');
    expect(production.EXPO_PUBLIC_POSTHOG_KEY).toMatch(/^phc_/);

    const preview = publicEnv(easJson, 'preview');
    expect(preview.EXPO_PUBLIC_API_URL).toBe('https://api.pawpawcare.app');
    expect(preview.EXPO_PUBLIC_POSTHOG_KEY).toBeUndefined();
  });

  test.each(Object.entries(OTA_WORKFLOWS))(
    'the %s OTA workflow generates .env.local from eas.json and hand-writes no EXPO_PUBLIC value',
    (profile, workflow) => {
      const yaml = fs.readFileSync(path.join(REPO, workflow), 'utf8');
      expect(yaml).toContain(`node scripts/eas-env.js ${profile} > .env.local`);

      const handWritten = yaml
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .filter((line) => /EXPO_PUBLIC_[A-Z0-9_]+\s*[=:]/.test(line));
      expect(handWritten).toEqual([]);
    },
  );
});
