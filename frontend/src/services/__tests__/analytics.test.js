// Guards the load-bearing contract: with no PostHog key configured (the default
// in dev/CI — EXPO_PUBLIC_POSTHOG_KEY is unset here), the native module is never
// required and every helper is a safe no-op that never throws. This is what
// keeps an analytics-disabled build (or an OTA onto an older build) from
// crashing.
import { track, identifyUser, resetAnalytics, trackScreen } from '../analytics';

describe('analytics (disabled, no key)', () => {
  it('exports the helper API', () => {
    expect(typeof track).toBe('function');
    expect(typeof identifyUser).toBe('function');
    expect(typeof resetAnalytics).toBe('function');
    expect(typeof trackScreen).toBe('function');
  });

  it('no-ops without throwing when analytics is disabled', () => {
    expect(() => track('user_signed_up', { foo: 'bar' })).not.toThrow();
    expect(() => identifyUser({ id: 'abc-123', email: 'x@y.z' })).not.toThrow();
    expect(() => identifyUser(null)).not.toThrow();
    expect(() => identifyUser(undefined)).not.toThrow();
    expect(() => resetAnalytics()).not.toThrow();
    expect(() => trackScreen('Dashboard')).not.toThrow();
    expect(() => trackScreen(undefined)).not.toThrow();
  });

  it('returns undefined from the helpers', () => {
    expect(track('e')).toBeUndefined();
    expect(identifyUser({ id: '1' })).toBeUndefined();
    expect(trackScreen('Pets')).toBeUndefined();
  });
});
