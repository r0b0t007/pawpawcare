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
