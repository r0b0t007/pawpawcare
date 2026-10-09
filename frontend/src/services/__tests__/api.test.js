// Error shapes the crash-report filter (services/scrub.js) relies on, and no
// request URLs (record ids, signed links) in release-build errors or logs.
jest.mock('../tokenStorage', () => ({
  getTokens: jest.fn(() => Promise.resolve({ access: 'a', refresh: 'r' })),
  storeTokens: jest.fn(() => Promise.resolve()),
  clearTokens: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-file-system', () => ({ File: function File() {} }));

import { get } from '../api';

const originalDev = global.__DEV__;
const originalFetch = global.fetch;
afterEach(() => {
  global.__DEV__ = originalDev;
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('network failures are flagged and carry no URL in release builds', async () => {
  global.__DEV__ = false;
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));

  const err = await get('/pets/9f1c2b7e-4a6d-4c1e-9b0a-3d2f1e0c9a8b/documents').catch((e) => e);

  expect(err.isNetworkError).toBe(true);
  expect(err.message).toBe('Network error: Network request failed');
  expect(log).not.toHaveBeenCalled();
});

test('API errors keep their status and the server error code', async () => {
  global.__DEV__ = false;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 402,
      json: () => Promise.resolve({ detail: 'Upgrade to use this feature', code: 'upgrade_required' }),
    }),
  );

  const err = await get('/pets').catch((e) => e);

  expect(err.message).toBe('Upgrade to use this feature');
  expect(err.status).toBe(402);
  expect(err.code).toBe('upgrade_required');
});
