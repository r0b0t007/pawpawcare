const path = require('path');
const { check, compare, profileEnv, workflowEnv } = require('../check-public-env');

const yaml = (lines) => `run: |\n  {\n${lines.map((l) => `    echo "${l}"`).join('\n')}\n  } >> .env.local\n`;

describe('check-public-env', () => {
  test('the repo itself has no drift', () => {
    expect(check(path.resolve(__dirname, '../../..'))).toEqual([]);
  });

  test('reads only EXPO_PUBLIC_* from a profile and from workflow echo lines', () => {
    const eas = { build: { production: { env: { ENVIRONMENT: 'production', EXPO_PUBLIC_A: '1' } } } };
    expect(profileEnv(eas, 'production')).toEqual({ EXPO_PUBLIC_A: '1' });
    expect(workflowEnv(yaml(['EXPO_PUBLIC_A=1', 'OTHER=2']))).toEqual({ EXPO_PUBLIC_A: '1' });
  });

  test('flags a key the OTA workflow would strip', () => {
    const problems = compare('production', { EXPO_PUBLIC_A: '1', EXPO_PUBLIC_B: '2' }, { EXPO_PUBLIC_A: '1' }, 'ota.yml');
    expect(problems).toEqual([expect.stringContaining('EXPO_PUBLIC_B is in eas.json "production" but not in ota.yml')]);
  });

  test('flags a key store builds would lack (the missing-PostHog-key bug)', () => {
    const problems = compare('production', { EXPO_PUBLIC_A: '1' }, { EXPO_PUBLIC_A: '1', EXPO_PUBLIC_POSTHOG_KEY: '${{ secrets.POSTHOG_KEY }}' }, 'ota.yml');
    expect(problems).toEqual([expect.stringContaining('EXPO_PUBLIC_POSTHOG_KEY is in ota.yml but not in eas.json')]);
  });

  test('flags differing literal values but accepts secret references', () => {
    expect(compare('p', { EXPO_PUBLIC_A: '1' }, { EXPO_PUBLIC_A: '2' }, 'w.yml')).toEqual([
      expect.stringContaining('EXPO_PUBLIC_A differs'),
    ]);
    expect(compare('p', { EXPO_PUBLIC_API_URL: 'https://x' }, { EXPO_PUBLIC_API_URL: '${{ secrets.BACKEND_URL }}' }, 'w.yml')).toEqual([]);
  });
});
