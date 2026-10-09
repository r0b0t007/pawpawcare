// Crash reporting must stay off without a DSN and in development, and when on
// it must use the privacy settings and scrubbers — never screenshots/PII.

const mockSentry = {
  init: jest.fn(),
  wrap: jest.fn((c) => c),
  setUser: jest.fn(),
  captureException: jest.fn(() => 'event-id'),
  reactNavigationIntegration: jest.fn(() => ({ registerNavigationContainer: jest.fn() })),
  ErrorBoundary: () => null,
};

function load({ dsn, dev }) {
  jest.resetModules();
  jest.doMock('@sentry/react-native', () => mockSentry);
  jest.doMock('expo-updates', () => ({ channel: 'preview' }));
  jest.doMock('../../config', () => ({ SENTRY_DSN: dsn }));
  global.__DEV__ = dev;
  return require('../sentry');
}

const originalDev = global.__DEV__;
afterEach(() => {
  global.__DEV__ = originalDev;
  jest.clearAllMocks();
});

test('stays off without a DSN', () => {
  const sentry = load({ dsn: '', dev: false });
  sentry.initSentry();
  expect(mockSentry.init).not.toHaveBeenCalled();
  expect(sentry.isSentryEnabled()).toBe(false);
  expect(sentry.captureException(new Error('x'))).toBe('');
});

test('stays off in development even with a DSN', () => {
  const sentry = load({ dsn: 'https://k@o1.ingest.sentry.io/2', dev: true });
  sentry.initSentry();
  expect(mockSentry.init).not.toHaveBeenCalled();
});

test('initialises with privacy settings and the scrubbers', () => {
  const sentry = load({ dsn: 'https://k@o1.ingest.sentry.io/2', dev: false });
  const scrub = require('../scrub');
  sentry.initSentry();

  expect(mockSentry.init).toHaveBeenCalledTimes(1);
  const options = mockSentry.init.mock.calls[0][0];
  expect(options).toMatchObject({
    dsn: 'https://k@o1.ingest.sentry.io/2',
    environment: 'preview',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: scrub.scrubBreadcrumb,
    beforeSend: scrub.scrubEvent,
    beforeSendTransaction: scrub.scrubTransaction,
  });
  expect(options).not.toHaveProperty('replaysSessionSampleRate');
  expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
  expect(sentry.isSentryEnabled()).toBe(true);
  expect(sentry.captureException(new Error('x'))).toBe('event-id');
});

test('tags reports with the user id only', () => {
  const sentry = load({ dsn: '', dev: false });
  sentry.setSentryUser({ id: 42, email: 'owner@example.com', name: 'Sam' });
  expect(mockSentry.setUser).toHaveBeenLastCalledWith({ id: '42' });
  sentry.clearSentryUser();
  expect(mockSentry.setUser).toHaveBeenLastCalledWith(null);
});
