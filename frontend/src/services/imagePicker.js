import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from './api';

/**
 * Let the user pick a photo and upload it. Resolves to:
 *   { url } on success · { canceled: true } · { error } (permission/upload failure)
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

  try {
    const url = await uploadImage(result.assets[0].uri);
    return { url };
  } catch (e) {
    return { error: e?.message || 'upload_failed' };
  }
}
