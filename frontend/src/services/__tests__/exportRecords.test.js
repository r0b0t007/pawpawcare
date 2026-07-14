// Exercises the native export flow: stream the authed file to disk with
// FileSystem.downloadAsync (NOT the old blob/FileReader chain that failed on
// Android), retry once on 401, and hand the file to the OS share sheet.

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../config', () => ({ API_URL: 'https://api.test' }));
jest.mock('../api', () => ({
  getTokens: jest.fn(() => Promise.resolve({ access: 'access-1' })),
  refreshAccessToken: jest.fn(),
}));

import { exportRecords } from '../exportRecords';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getTokens, refreshAccessToken } from '../api';

beforeEach(() => {
  jest.clearAllMocks();
  getTokens.mockResolvedValue({ access: 'access-1' });
});

// jest-expo defaults Platform.OS to 'ios', so these hit the native path.
describe('exportRecords (native)', () => {
  it('downloads the authed file and opens the share sheet', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///cache/out.pdf' });

    await exportRecords('pdf', ['p1', 'p2']);

    expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(1);
    const [url, fileUri, opts] = FileSystem.downloadAsync.mock.calls[0];
    expect(url).toContain('https://api.test/users/me/export');
    expect(url).toContain('format=pdf');
    expect(url).toContain('pets=p1%2Cp2'); // comma-encoded
    expect(fileUri).toMatch(/^file:\/\/\/cache\/pawpawcare-records-.*\.pdf$/);
    expect(opts.headers.Authorization).toBe('Bearer access-1');
    expect(opts.headers.Accept).toBe('application/pdf');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/out.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('omits the pets param when exporting all', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///cache/out.csv' });

    await exportRecords('csv', []);

    const [url] = FileSystem.downloadAsync.mock.calls[0];
    expect(url).toContain('format=csv');
    expect(url).not.toContain('pets=');
  });

  it('refreshes the token and retries once on 401', async () => {
    FileSystem.downloadAsync
      .mockResolvedValueOnce({ status: 401, uri: 'file:///cache/x.pdf' })
      .mockResolvedValueOnce({ status: 200, uri: 'file:///cache/x.pdf' });
    refreshAccessToken.mockResolvedValue('access-2');

    await exportRecords('pdf', []);

    expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(FileSystem.downloadAsync.mock.calls[1][2].headers.Authorization).toBe('Bearer access-2');
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it("surfaces the backend's detail message, cleans up, and does not share on non-2xx", async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 429, uri: 'file:///cache/x.pdf' });
    FileSystem.readAsStringAsync.mockResolvedValue('{"detail":"Too many exports — try again soon"}');

    await expect(exportRecords('pdf', [])).rejects.toThrow('Too many exports — try again soon');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/pawpawcare-records-.*\.pdf$/),
      { idempotent: true },
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 500, uri: 'file:///cache/x.pdf' });
    FileSystem.readAsStringAsync.mockResolvedValue('<html>500</html>');

    await expect(exportRecords('pdf', [])).rejects.toThrow('Export failed (500)');
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
  });

  it('throws SESSION_EXPIRED (no retry, no share) when the token refresh fails', async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 401, uri: 'file:///cache/x.pdf' });
    refreshAccessToken.mockRejectedValue(new Error('refresh rejected'));

    await expect(exportRecords('pdf', [])).rejects.toThrow('SESSION_EXPIRED');
    expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(1); // no second attempt
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
