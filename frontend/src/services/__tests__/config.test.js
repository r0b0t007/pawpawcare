// SENTRY_DSN resolution: committed default, env override, and an explicit
// opt-out for e2e/test builds (EAS rejects empty env values, hence "off").
const ORIGINAL = process.env.EXPO_PUBLIC_SENTRY_DSN;

function dsnWith(value) {
  if (value === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = value;
  let dsn;
  jest.isolateModules(() => {
    dsn = require('../../config').SENTRY_DSN;
  });
  return dsn;
}

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL;
});

test('defaults to the pawpawcare-app DSN', () => {
  expect(dsnWith(undefined)).toMatch(/^https:\/\/[0-9a-f]+@o\d+\.ingest\.us\.sentry\.io\/4512223210504192$/);
});

test('an https DSN in the env overrides the default', () => {
  expect(dsnWith('https://k@o1.ingest.sentry.io/2')).toBe('https://k@o1.ingest.sentry.io/2');
});

test('"off" (or anything that is not an https DSN) disables reporting', () => {
  expect(dsnWith('off')).toBe('');
  expect(dsnWith('')).toBe('');
});

// RevenueCat SDK keys: public keys only — a secret key must never ship.
function rcKeys(ios, android) {
  const set = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  set('EXPO_PUBLIC_REVENUECAT_IOS_KEY', ios);
  set('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', android);
  let cfg;
  jest.isolateModules(() => {
    cfg = require('../../config');
  });
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return [cfg.REVENUECAT_IOS_KEY, cfg.REVENUECAT_ANDROID_KEY];
}

test('RevenueCat keys accept public SDK keys per platform', () => {
  expect(rcKeys('appl_abc', 'goog_abc')).toEqual(['appl_abc', 'goog_abc']);
  expect(rcKeys('test_abc', 'test_abc')).toEqual(['test_abc', 'test_abc']);
});

test('RevenueCat keys refuse secret keys and cross-platform keys', () => {
  expect(rcKeys('sk_secret', 'sk_secret')).toEqual(['', '']);
  expect(rcKeys('goog_abc', 'appl_abc')).toEqual(['', '']);
});

test('Test Store keys are refused outside development builds', () => {
  const dev = global.__DEV__;
  global.__DEV__ = false;
  try {
    expect(rcKeys('test_abc', 'test_abc')).toEqual(['', '']);
    expect(rcKeys('appl_abc', 'goog_abc')).toEqual(['appl_abc', 'goog_abc']);
  } finally {
    global.__DEV__ = dev;
  }
});

