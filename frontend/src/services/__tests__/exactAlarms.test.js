// CHW-244: the Android "exact alarms" helper must never get in the way where
// the native module isn't there (iOS, older builds, Expo Go): it then reports
// "nothing to do" so no prompt appears.
const load = ({ os, native }) => {
  jest.resetModules();
  jest.doMock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => native) }));
  require('react-native').Platform.OS = os;
  return require('../exactAlarms');
};

test('android with the module: reports and opens the setting', () => {
  const native = { canScheduleExactAlarms: jest.fn(() => false), openSettings: jest.fn(() => true) };
  const { canScheduleExactAlarms, openExactAlarmSettings } = load({ os: 'android', native });

  expect(canScheduleExactAlarms()).toBe(false);
  expect(openExactAlarmSettings()).toBe(true);
  expect(native.openSettings).toHaveBeenCalledTimes(1);
});

test('android build without the module: nothing to do', () => {
  const { canScheduleExactAlarms, openExactAlarmSettings } = load({ os: 'android', native: null });
  expect(canScheduleExactAlarms()).toBe(true);
  expect(openExactAlarmSettings()).toBe(false);
});

test('iOS never looks for it', () => {
  const native = { canScheduleExactAlarms: jest.fn(() => false), openSettings: jest.fn() };
  const { canScheduleExactAlarms } = load({ os: 'ios', native });
  expect(canScheduleExactAlarms()).toBe(true);
  expect(native.canScheduleExactAlarms).not.toHaveBeenCalled();
});

test('a native error is treated as "nothing to do"', () => {
  const native = { canScheduleExactAlarms: () => { throw new Error('no context'); }, openSettings: () => { throw new Error('no activity'); } };
  const { canScheduleExactAlarms, openExactAlarmSettings } = load({ os: 'android', native });
  expect(canScheduleExactAlarms()).toBe(true);
  expect(openExactAlarmSettings()).toBe(false);
});
