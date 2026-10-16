// Rollout switch for device-language detection (CHW-187).
//
// On since CHW-191, which translated every screen: the app follows the device
// language (fr/es; anything else gets English) and Profile → Language offers
// "Device default" (the default) next to an explicit English / Français /
// Español override.
//
// Off, the app starts in English and only switches when the user picks a
// language ("Device default" hidden). That path stays tested: it is the kill
// switch if a translation problem ever needs pulling over the air.
export const FOLLOW_DEVICE_LANGUAGE = true;
