// OTA updates can land on binaries built before a native SDK was added. These
// services must load (and stay inert) there instead of crashing the app.

const missing = () => {
  throw new Error('Cannot find native module');
};

afterEach(() => {
  jest.resetModules();
});

describe('sentry service', () => {
  test('degrades to no-ops when the native SDK is missing', () => {
    jest.doMock('@sentry/react-native', missing);
    const sentry = require('../sentry');

    expect(sentry.isSentryAvailable()).toBe(false);
    const Root = () => null;
    expect(sentry.wrapRoot(Root)).toBe(Root);
    expect(() => {
      sentry.initSentry();
      sentry.captureException(new Error('x'));
      sentry.setSentryUser({ id: 1 });
      sentry.clearSentryUser();
    }).not.toThrow();
  });

  test('reports the SDK as available when the binary has it', () => {
    jest.doMock('@sentry/react-native', () => ({ init: jest.fn() }));
    expect(require('../sentry').isSentryAvailable()).toBe(true);
  });
});

describe('purchases service', () => {
  test('reports unavailable when the native SDK is missing', () => {
    jest.doMock('react-native-purchases', missing);
    expect(require('../purchases').isPurchasesAvailable()).toBe(false);
  });

  test('reports available when the binary has it', () => {
    jest.doMock('react-native-purchases', () => ({ __esModule: true, default: { configure: jest.fn() } }));
    expect(require('../purchases').isPurchasesAvailable()).toBe(true);
  });
});
