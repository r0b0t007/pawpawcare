// Offline reminders: every occurrence in the server's upcoming_fire_at (the
// next week) is scheduled as a local notification, so a daily dose keeps
// arriving while the phone is offline — not only the next one.
jest.mock('expo-constants', () => ({}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('../prefs', () => ({
  getPref: jest.fn((key, fallback) => Promise.resolve(fallback)),
  setPref: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
}));

const Notifications = require('expo-notifications');
const { getPref } = require('../prefs');
const { scheduleLocalReminders } = require('../notifications');

const NOW = new Date('2026-10-18T10:00:00Z').getTime();
const day = (n, time = '08:00') => new Date(Date.UTC(2026, 9, 18 + n, ...time.split(':').map(Number))).toISOString();
const scheduled = () => Notifications.scheduleNotificationAsync.mock.calls.map(([n]) => n);

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  Notifications.scheduleNotificationAsync.mockClear();
  Notifications.cancelAllScheduledNotificationsAsync.mockClear();
});
afterEach(() => jest.useRealTimers());

const daily = (id, times) => ({
  id, pet_id: 'p1', title: 'Pill', body: 'Give Rex his pill', enabled: true,
  next_fire_at: times[0], upcoming_fire_at: times,
});

test('every upcoming occurrence is scheduled, each with its own identifier', async () => {
  const week = [1, 2, 3, 4, 5, 6, 7].map((n) => day(n));
  await scheduleLocalReminders([daily('r1', week)]);

  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  expect(scheduled().map((n) => n.trigger.date.toISOString())).toEqual(week);
  expect(new Set(scheduled().map((n) => n.identifier)).size).toBe(7);
  expect(scheduled()[0]).toEqual(expect.objectContaining({
    identifier: `r1:${week[0]}`,
    content: expect.objectContaining({ title: 'Pill', data: { reminderId: 'r1', petId: 'p1', screen: 'Notifications' } }),
  }));
});

test('past occurrences and switched-off reminders are skipped', async () => {
  await scheduleLocalReminders([
    daily('r1', [day(0, '08:00'), day(1), day(2)]), // today 08:00 is already past
    { ...daily('r2', [day(1, '09:00')]), enabled: false },
  ]);

  expect(scheduled().map((n) => n.identifier)).toEqual([`r1:${day(1)}`, `r1:${day(2)}`]);
});

test('without upcoming_fire_at (an older server) the next occurrence is still scheduled', async () => {
  await scheduleLocalReminders([{ id: 'r1', title: 'Vet', enabled: true, next_fire_at: day(3) }]);
  await scheduleLocalReminders([{ id: 'r1', title: 'Vet', enabled: true, next_fire_at: day(3), upcoming_fire_at: [] }]);

  expect(scheduled().map((n) => n.identifier)).toEqual([`r1:${day(3)}`, `r1:${day(3)}`]);
});

test('over the cap, the soonest occurrences across all reminders win', async () => {
  // 10 reminders x 7 days = 70 occurrences; only 60 fit (iOS keeps ~64).
  const reminders = Array.from({ length: 10 }, (_, i) =>
    daily(`r${i}`, [1, 2, 3, 4, 5, 6, 7].map((n) => day(n, `0${i}:00`))));
  await scheduleLocalReminders(reminders);

  const dates = scheduled().map((n) => n.trigger.date.getTime());
  expect(dates).toHaveLength(60);
  expect(dates).toEqual([...dates].sort((a, b) => a - b));
  expect(Math.max(...dates)).toBeLessThan(new Date(day(7, '00:00')).getTime());
});

test('the Care reminders switch off means nothing is scheduled', async () => {
  getPref.mockImplementationOnce(() => Promise.resolve(false));
  await scheduleLocalReminders([daily('r1', [day(1)])]);

  expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  expect(scheduled()).toEqual([]);
});
