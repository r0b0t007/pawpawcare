// Analytics opt-out (Profile → Privacy): PostHog's own optOut() is cleared by
// reset() on every logout, so the device keeps its choice and re-applies it;
// the account's server value (analytics_opt_out) wins when a user signs in.

const mockPosthog = {
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  screen: jest.fn(),
  optIn: jest.fn(),
  optOut: jest.fn(),
};
const mockPrefs = {};

function load({ stored } = {}) {
  jest.resetModules();
  Object.keys(mockPrefs).forEach((k) => delete mockPrefs[k]);
  if (stored !== undefined) mockPrefs.analyticsOptOut = stored;
  Object.values(mockPosthog).forEach((fn) => fn.mockClear());
  jest.doMock('../../config', () => ({ POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://us.i.posthog.com' }));
  jest.doMock('posthog-react-native', () => ({ __esModule: true, default: jest.fn(() => mockPosthog) }));
  jest.doMock('../prefs', () => ({
    getPref: jest.fn((key, fallback) => Promise.resolve(key in mockPrefs ? mockPrefs[key] : fallback)),
    setPref: jest.fn((key, value) => {
      mockPrefs[key] = value;
      return Promise.resolve();
    }),
  }));
  return require('../analytics');
}

test('a stored opt-out is applied at launch', async () => {
  const analytics = load({ stored: true });
  await analytics.analyticsReady;
  expect(mockPosthog.optOut).toHaveBeenCalled();
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('opting out persists on the device, and survives the reset() at logout', async () => {
  const analytics = load();
  await analytics.analyticsReady;

  analytics.setAnalyticsEnabled(false);
  expect(mockPosthog.optOut).toHaveBeenCalledTimes(1);
  expect(mockPrefs.analyticsOptOut).toBe(true);

  analytics.resetAnalytics();
  expect(mockPosthog.reset).toHaveBeenCalled();
  expect(mockPosthog.optOut).toHaveBeenCalledTimes(2); // re-applied after reset
});

test('the account value wins at sign-in, and no one is identified while opted out', async () => {
  const analytics = load(); // device says: sharing
  await analytics.analyticsReady;

  analytics.identifyUser({ id: 7, analytics_opt_out: true });

  expect(mockPosthog.optOut).toHaveBeenCalled();
  expect(mockPosthog.identify).not.toHaveBeenCalled();
  expect(mockPrefs.analyticsOptOut).toBe(true);
  expect(analytics.isAnalyticsEnabled()).toBe(false);
});

test('an account that shares overrides a stale device opt-out', async () => {
  const analytics = load({ stored: true });
  await analytics.analyticsReady;

  analytics.identifyUser({ id: 7, analytics_opt_out: false });

  expect(mockPosthog.optIn).toHaveBeenCalled();
  expect(mockPosthog.identify).toHaveBeenCalledWith('7');
  expect(analytics.isAnalyticsEnabled()).toBe(true);
});

test('opting back in re-identifies the signed-in user', async () => {
  const analytics = load();
  await analytics.analyticsReady;
  analytics.identifyUser({ id: 7, analytics_opt_out: true });

  analytics.setAnalyticsEnabled(true);

  expect(mockPosthog.optIn).toHaveBeenCalled();
  expect(mockPosthog.identify).toHaveBeenCalledWith('7');
  expect(mockPrefs.analyticsOptOut).toBe(false);
});
