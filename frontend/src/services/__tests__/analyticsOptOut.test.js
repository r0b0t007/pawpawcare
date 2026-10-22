// Analytics opt-out (Profile → Privacy). PostHog's own persisted OptedOut flag
// is the single source of truth on the device; logout's reset() must keep it,
// and the account's server value (analytics_opt_out) wins when a user signs in.

// A stand-in that behaves like posthog-react-native: optIn/optOut persist, and
// reset(keep) clears every persisted property except those listed. With no list
// it keeps the SDK's defaults (install markers and device id); a list replaces them.
const SDK_DEFAULT_KEEP = ['installed_app_build', 'installed_app_version', 'device_id'];
function makePosthog() {
  const persisted = { installed_app_build: '3', installed_app_version: '1.0.0', device_id: 'dev-1' };
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
    reset: jest.fn((keep) => {
      const kept = keep ?? SDK_DEFAULT_KEEP;
      for (const key of Object.keys(persisted)) if (!kept.includes(key)) delete persisted[key];
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
    PostHogPersistedProperty: {
      OptedOut: 'opted_out',
      InstalledAppBuild: 'installed_app_build',
      InstalledAppVersion: 'installed_app_version',
      DeviceId: 'device_id',
    },
  }));
  return require('../analytics');
}

test('the client is created with lifecycle events on, replay and error autocapture off, explicitly', () => {
  load();
  const PostHog = require('posthog-react-native').default;
  expect(PostHog).toHaveBeenCalledWith(
    'phc_test',
    expect.objectContaining({
      host: 'https://us.i.posthog.com',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      errorTracking: { autocapture: false },
    }),
  );
});

test('the URL that opened the app never leaves the device', () => {
  const analytics = load();
  const { before_send: beforeSend } = require('posthog-react-native').default.mock.calls[0][1];
  expect(beforeSend).toBe(analytics.dropLaunchUrl);

  const opened = { event: 'Application Opened', properties: { url: 'pawpawcare://reset?token=x', $app_build: '3' } };
  expect(beforeSend(opened)).toEqual({ event: 'Application Opened', properties: { $app_build: '3' } });
  // Other events, and their own url-like properties, pass through untouched.
  const other = { event: 'pet_added', properties: { url: 'kept' } };
  expect(beforeSend(other)).toBe(other);
});

test('logout keeps the install markers, so a relaunch is not a new install', () => {
  const analytics = load();

  analytics.resetAnalytics();

  expect(mockPosthog.persisted).toEqual({
    installed_app_build: '3',
    installed_app_version: '1.0.0',
    device_id: 'dev-1',
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

  expect(mockPosthog.reset).toHaveBeenCalledWith(expect.arrayContaining(['opted_out']));
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
