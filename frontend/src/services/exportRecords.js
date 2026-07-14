import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL } from '../config';
import { getTokens, refreshAccessToken } from './api';

// Export center: download the user's full health-record history (CSV/PDF)
// and hand it to the OS share sheet — or a plain download on web. Kept out
// of ProfileScreen so the screen stays presentational.

const MIME = {
  csv: 'text/csv',
  pdf: 'application/pdf',
};

function exportUrl(format, petIds) {
  const params = new URLSearchParams({ format });
  if (petIds && petIds.length) params.set('pets', petIds.join(','));
  return `${API_URL}/users/me/export?${params}`;
}

function authHeaders(format, token) {
  return {
    Accept: MIME[format],
    'bypass-tunnel-reminder': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Download the export and open the OS share sheet (native) or trigger a
 * browser download (web). `format` is 'pdf' | 'csv'; `petIds` optional —
 * omitted/empty means every pet. Throws on failure so callers can toast.
 */
export async function exportRecords(format, petIds = []) {
  const url = exportUrl(format, petIds);
  const filename = `pawpawcare-records-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (Platform.OS === 'web') {
    // No file system / share sheet on web — fetch as a blob and click a link.
    const { access } = await getTokens();
    let res = await fetch(url, { headers: authHeaders(format, access) });
    if (res.status === 401) {
      let newToken;
      try {
        newToken = await refreshAccessToken();
      } catch {
        throw new Error('SESSION_EXPIRED');
      }
      res = await fetch(url, { headers: authHeaders(format, newToken) });
    }
    if (!res.ok) throw new Error(`Export failed (${res.status})`);

    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    return;
  }

  // Native: stream the authed response straight to a file, then share it. This
  // replaces the old blob → FileReader → base64 → writeAsStringAsync chain,
  // which is unreliable on Android RN and was throwing "Export failed" there.
  const fileUri = FileSystem.cacheDirectory + filename;
  const download = (token) =>
    FileSystem.downloadAsync(url, fileUri, { headers: authHeaders(format, token) });

  const { access } = await getTokens();
  let result = await download(access);

  if (result.status === 401) {
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch {
      throw new Error('SESSION_EXPIRED');
    }
    result = await download(newToken);
  }

  if (result.status < 200 || result.status >= 300) {
    // A non-2xx response means downloadAsync wrote an error body to the file,
    // not a valid document — surface it instead of sharing a broken file.
    throw new Error(`Export failed (${result.status})`);
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: MIME[format],
    dialogTitle: 'Export health records',
    UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
}
