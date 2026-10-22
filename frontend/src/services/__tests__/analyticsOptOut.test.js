// Analytics opt-out (Profile → Privacy). PostHog's own persisted OptedOut flag
// is the single source of truth on the device; logout's reset() must keep it,
// and the account's server value (analytics_opt_out) wins when a user signs in.

// A stand-in that behaves like posthog-react-native: optIn/optOut persist,
// reset(keep) clears every persisted property except those listed.
function makePosthog() {
  const persisted = {};
  return {
    persisted,
    get optedOut() {
      return persisted.opted_out ?? false;
    },
    optIn: jest.fn(() => {
      persisted.opted_out = false;
    }),
    optOut: jest.fn(() => {
      persisted.opted_out = true;
    }),
    identify: jest.fn(),
    capture: jest.fn(),
    screen: jest.fn(),
    reset: jest.fn((keep = []) => {
      for (const key of Object.keys(persisted)) if (!keep.includes(key)) delete persisted[key];
    }),
  };
}

let mockPosthog;
function load() {
  jest.resetModules();
  mockPosthog = makePosthog();
  jest.doMock('../../config', () => ({ POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://us.i.posthog.com' }));
  jest.doMock('posthog-react-native', () => ({
    __esModule: true,
    default: jest.fn(() => mockPosthog),
    PostHogPersistedProperty: { OptedOut: 'opted_out' },
  }));
  return require('../analytics');
}

test('the client is created with lifecycle events on and session replay off, explicitly', () => {
  load();
  const PostHog = require('posthog-react-native').default;
  expect(PostHog).toHaveBeenCalledWith('phc_test', {
    host: 'https://us.i.posthog.com',
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
  });
});

test('the switch state is PostHog’s persisted state', () => {
  const analytics = load();
  expect(analytics.isAnalyticsEnabled()).toBe(true);
  analytics.setAnalyticsEnabled(false);
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('an opt-out survives the reset() at logout', () => {
  const analytics = load();
  analytics.setAnalyticsEnabled(false);

  analytics.resetAnalytics();

  expect(mockPosthog.reset).toHaveBeenCalledWith(['opted_out']);
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('the account value wins at sign-in, and no one is identified while opted out', () => {
  const analytics = load(); // device: sharing

  analytics.identifyUser({ id: 7, analytics_opt_out: true });

  expect(mockPosthog.optOut).toHaveBeenCalled();
  expect(mockPosthog.identify).not.toHaveBeenCalled();
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('an account that shares overrides a stale device opt-out', () => {
  const analytics = load();
  analytics.setAnalyticsEnabled(false); // device: opted out

  analytics.identifyUser({ id: 7, analytics_opt_out: false });

  expect(mockPosthog.optIn).toHaveBeenCalled();
  expect(mockPosthog.identify).toHaveBeenCalledWith('7');
  expect(analytics.isAnalyticsEnabled()).toBe(true);
});

test('without an account value the device state decides', () => {
  const analytics = load();
  analytics.setAnalyticsEnabled(false);

  analytics.identifyUser({ id: 7 }); // e.g. a /users/me payload from before the migration

  expect(mockPosthog.identify).not.toHaveBeenCalled();
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('opting back in re-identifies the signed-in user', () => {
  const analytics = load();
  analytics.identifyUser({ id: 7, analytics_opt_out: true });

  analytics.setAnalyticsEnabled(true);

  expect(mockPosthog.identify).toHaveBeenCalledWith('7');
  expect(analytics.isAnalyticsEnabled()).toBe(true);
});
