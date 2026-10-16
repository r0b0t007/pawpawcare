// Rollout switch for device-language detection (CHW-187).
//
// While only part of the app is translated, following the device language
// would hand every fr/es-device install a mixed-language app the moment this
// ships over the air. So until the remaining screens land, the app starts in
// English and only switches when the user picks Français or Español in
// Profile → Language (the "Device default" choice is hidden).
//
// Flip to true in the PR that finishes the CHW-187 screen migrations.
export const FOLLOW_DEVICE_LANGUAGE = false;
