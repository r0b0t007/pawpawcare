import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from './api';

/**
 * Let the user pick a photo and upload it. Resolves to:
 *   { url } on success · { canceled: true } · { error } (permission failure)
 *   · { error, uri } (upload failure — the picked local uri is retained so
 *     callers can show it and retry the upload without re-picking)
 */
export async function pickAndUploadImage({ aspect = [1, 1] } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'permission' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  });
  if (result.canceled) return { canceled: true };

  const uri = result.assets[0].uri;
  try {
    const url = await uploadImage(uri);
    return { url };
  } catch (e) {
    return { error: e?.message || 'upload_failed', uri };
  }
}

/**
 * Pick a photo of a record WITHOUT uploading (the caller attaches a title /
 * category and posts it to the documents endpoint). Resolves to:
 *   { uri, name } · { canceled: true } · { error }
 */
export async function pickRecordImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'permission' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled) return { canceled: true };

  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.fileName || (asset.uri.split('/').pop() || 'document.jpg') };
}
