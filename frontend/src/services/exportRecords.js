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

// The JSON api client can't carry binary bodies, so this mirrors uploadImage:
// an authed raw fetch with a single 401-refresh retry.
async function fetchExport(format, petIds) {
  const params = new URLSearchParams({ format });
  if (petIds && petIds.length) params.set('pets', petIds.join(','));
  const url = `${API_URL}/users/me/export?${params}`;

  const send = (token) =>
    fetch(url, {
      headers: {
        Accept: MIME[format],
        'bypass-tunnel-reminder': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const { access } = await getTokens();
  let res = await send(access);

  if (res.status === 401) {
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch {
      throw new Error('SESSION_EXPIRED');
    }
    res = await send(newToken);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Export failed (${res.status})`);
  }
  return res;
}

// blob → base64 payload (strip the data: prefix). FileReader is available on
// both React Native and web, unlike Buffer/btoa-over-bytes.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read export'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

/**
 * Download the export and open the OS share sheet (native) or trigger a
 * browser download (web). `format` is 'pdf' | 'csv'; `petIds` optional —
 * omitted/empty means every pet. Throws on failure so callers can toast.
 */
export async function exportRecords(format, petIds = []) {
  const res = await fetchExport(format, petIds);
  const filename = `pawpawcare-records-${new Date().toISOString().slice(0, 10)}.${format}`;
  const blob = await res.blob();

  if (Platform.OS === 'web') {
    // No file system / share sheet on web — a plain download link.
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

  const base64 = await blobToBase64(blob);
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
  await Sharing.shareAsync(uri, {
    mimeType: MIME[format],
    dialogTitle: 'Export health records',
    UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
}
