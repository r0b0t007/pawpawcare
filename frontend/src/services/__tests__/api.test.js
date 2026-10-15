// Error shapes the crash-report filter (services/scrub.js) relies on, and no
// request URLs (record ids, signed links) in release-build errors or logs.
jest.mock('../tokenStorage', () => ({
  getTokens: jest.fn(() => Promise.resolve({ access: 'a', refresh: 'r' })),
  storeTokens: jest.fn(() => Promise.resolve()),
  clearTokens: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-file-system', () => ({ File: function File() {} }));

import { get, uploadImage, uploadDocument } from '../api';
import i18n from '../../i18n';
import { clearTokens } from '../tokenStorage';

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

const json = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

describe('expired access token', () => {
  beforeEach(() => {
    global.__DEV__ = false;
    clearTokens.mockClear();
  });

  test('offline during the refresh keeps the session and reports a network error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json(401)) // access token expired
      .mockRejectedValueOnce(new TypeError('Network request failed')); // refresh call

    const err = await get('/pets').catch((e) => e);

    expect(err.isNetworkError).toBe(true);
    expect(err.message).not.toBe('SESSION_EXPIRED');
    expect(clearTokens).not.toHaveBeenCalled();
  });

  test('a server error during the refresh keeps the session', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(503));

    const err = await get('/pets').catch((e) => e);

    expect(err.status).toBe(503);
    expect(err.message).not.toBe('SESSION_EXPIRED');
    expect(clearTokens).not.toHaveBeenCalled();
  });

  test('a rejected refresh token ends the session', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(401, { detail: 'Invalid refresh token' }));

    const err = await get('/pets').catch((e) => e);

    expect(err.message).toBe('SESSION_EXPIRED');
    expect(clearTokens).toHaveBeenCalled();
  });

  test('offline on the retried request is still a network error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { access_token: 'a2', refresh_token: 'r2' }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const err = await get('/pets').catch((e) => e);

    expect(err.isNetworkError).toBe(true);
  });
});

test('uploads tag offline failures as network errors too', async () => {
  global.__DEV__ = false;
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed')));

  const err = await uploadImage('file:///tmp/photo.jpg').catch((e) => e);

  expect(err.isNetworkError).toBe(true);
  expect(err.message).toBe('Network error: Network request failed');
});

describe('Accept-Language', () => {
  afterEach(() => i18n.changeLanguage('en'));
  const lang = (call) => call[1].headers['Accept-Language'];

  test('every JSON request, the token refresh and the retry carry the app language', async () => {
    global.__DEV__ = false;
    global.fetch = jest.fn().mockResolvedValue(json(200, []));
    await get('/pets');
    expect(lang(global.fetch.mock.calls[0])).toBe('en');

    await i18n.changeLanguage('es');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { access_token: 'a2', refresh_token: 'r2' }))
      .mockResolvedValueOnce(json(200, []));
    await get('/pets');
    expect(global.fetch.mock.calls.map(lang)).toEqual(['es', 'es', 'es']);
  });

  test('uploads carry it too', async () => {
    global.__DEV__ = false;
    await i18n.changeLanguage('fr');
    global.fetch = jest.fn().mockResolvedValue(json(200, { url: '/storage/x.jpg', id: 'd1' }));
    await uploadImage('file:///tmp/photo.jpg');
    await uploadDocument('p1', { uri: 'file:///tmp/scan.pdf', name: 'scan.pdf' });
    expect(global.fetch.mock.calls.map(lang)).toEqual(['fr', 'fr']);
  });
});
