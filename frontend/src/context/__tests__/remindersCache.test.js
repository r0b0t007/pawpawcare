import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The reminders list lives in the React Query cache (remindersKeys). It is
// also this device's notification schedule: one listener schedules each new
// list, and nothing else does.
jest.mock('../../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
  uploadDocument: jest.fn(),
}));
jest.mock('../../services/notifications', () => ({
  scheduleLocalReminders: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../services/prefs', () => ({
  getPref: jest.fn(() => Promise.resolve({})),
  setPref: jest.fn(() => Promise.resolve()),
}));
let mockUser = { id: 'u1' };
const mockLogout = jest.fn();
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

import { DataProvider, useData } from '../DataContext';
import { get, post } from '../../services/api';
import { scheduleLocalReminders } from '../../services/notifications';

const reminder = (id, title = `Reminder ${id}`) => ({
  id, title, enabled: true, next_fire_at: '2030-01-01T09:00:00Z', fire_at: '2030-01-01T09:00:00Z',
});

let server;
let data;
function Probe() {
  data = useData();
  return null;
}

let tree;
let client;
const element = () => (
  <QueryClientProvider client={client}>
    <DataProvider>
      <Probe />
    </DataProvider>
  </QueryClientProvider>
);
const mount = () => act(async () => { tree = TestRenderer.create(element()); });
const reminderCalls = () => get.mock.calls.filter(([path]) => path === '/reminders').length;
const answer = (path) => {
  if (path === '/reminders') return Promise.resolve(server);
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  return Promise.resolve([]);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
  server = [reminder('r1')];
  get.mockImplementation(answer);
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('the reminders list in the cache', () => {
  it('is read by useData().reminders and scheduled once', async () => {
    await mount();

    expect(data.reminders.map((r) => r.id)).toEqual(['r1']);
    expect(client.getQueryData(['reminders', 'u1'])).toBe(data.reminders);
    expect(scheduleLocalReminders).toHaveBeenCalledTimes(1);
    expect(scheduleLocalReminders).toHaveBeenCalledWith(server);
    expect(data.lastSyncedAt).toEqual(expect.any(Number));
  });

  // Read without a query observer: nothing may garbage-collect it. A failed
  // read says so at once, as before.
  it('is never garbage-collected, and not retried', async () => {
    // The app's own client: default garbage collection and retries.
    client = new QueryClient({ defaultOptions: { queries: { retry: 2 } } });
    await mount();

    expect(client.getQueryCache().find({ queryKey: ['reminders', 'u1'] }).options)
      .toEqual(expect.objectContaining({ gcTime: Infinity, retry: false }));
  });

  // Every new list is a sync, not only the sign-in load's.
  it('a refresh alone stamps the sync time', async () => {
    await mount();
    const later = data.lastSyncedAt + 60000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);

    await act(async () => { await data.refreshReminders(); });

    expect(data.lastSyncedAt).toBe(later);
    now.mockRestore();
  });

  // Part of the sign-in load: a failed list counts, and the app isn't "synced".
  it('a failed list at sign-in counts as a failed load', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockImplementation((path) => (path === '/reminders' ? Promise.reject(new Error('Network error')) : answer(path)));
    await mount();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1/2 domains failed'));
    expect(data.lastSyncedAt).toBeNull();
    expect(data.dataLoaded).toBe(true);
    warn.mockRestore();
  });

  it('a failed refresh keeps the list, the schedule and the sync time', async () => {
    await mount();
    const syncedAt = data.lastSyncedAt;
    get.mockImplementation((path) => (path === '/reminders' ? Promise.reject(new Error('Network error')) : answer(path)));

    await act(async () => { await data.refreshReminders(); });

    expect(data.reminders.map((r) => r.id)).toEqual(['r1']);
    expect(scheduleLocalReminders).toHaveBeenCalledTimes(1);
    expect(data.lastSyncedAt).toBe(syncedAt);
  });

  // A screen confirms as soon as the save resolves: the list (and the phone's
  // schedule) must already have it.
  it('a saved reminder resolves once the list and the schedule have it', async () => {
    await mount();
    post.mockResolvedValue({});
    let answerList;
    get.mockImplementation((path) => (path === '/reminders'
      ? new Promise((resolve) => { answerList = resolve; })
      : answer(path)));

    let ok;
    await act(async () => { data.addReminder({ title: 'Walk' }).then((v) => { ok = v; }); });
    expect(ok).toBeUndefined();
    await act(async () => { answerList([reminder('r1'), reminder('r2', 'Walk')]); });

    expect(ok).toBe(true);
    expect(data.reminders.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(scheduleLocalReminders).toHaveBeenLastCalledWith([reminder('r1'), reminder('r2', 'Walk')]);
  });

  // Asked for at the same moment, one request answers both: it started after
  // either was asked for.
  it('refreshes asked for together share one request', async () => {
    await mount();
    const before = reminderCalls();

    await act(async () => { await Promise.all([data.refreshReminders(), data.refreshReminders()]); });

    expect(reminderCalls()).toBe(before + 1);
  });

  // The older request in flight is cancelled: its answer never lands, so it
  // never reaches the phone's schedule, even arriving last.
  it('an older answer never reaches the schedule', async () => {
    await mount();
    scheduleLocalReminders.mockClear();
    let answerOld;
    let answerNew;
    get.mockImplementation((path) => {
      if (path !== '/reminders') return answer(path);
      return new Promise((resolve) => { if (!answerOld) answerOld = resolve; else answerNew = resolve; });
    });
    let older;
    await act(async () => { older = data.refreshReminders(); });
    let newer;
    await act(async () => { newer = data.refreshReminders(); });

    await act(async () => { answerNew([]); await newer; answerOld([reminder('r1')]); await older; });

    expect(data.reminders).toEqual([]);
    expect(scheduleLocalReminders.mock.calls).toEqual([[[]]]);
  });
});

// A save confirms on the list it asked for, even when a newer refresh
// cancelled its own re-read.
describe('a refresh replaced by a newer one', () => {
  it('a save resolves on the newer list, not before it', async () => {
    await mount();
    post.mockResolvedValue({});
    const answers = [];
    get.mockImplementation((path) => (path === '/reminders'
      ? new Promise((resolve) => { answers.push(resolve); })
      : answer(path)));

    let ok;
    await act(async () => { data.addReminder({ title: 'Walk' }).then((v) => { ok = v; }); });
    expect(answers).toHaveLength(1);
    // The fire tick (or another change) refreshes meanwhile: the save's
    // re-read is cancelled.
    await act(async () => { data.refreshReminders(); });
    expect(answers).toHaveLength(2);
    await act(async () => { answers[0]([reminder('r1')]); });
    expect(ok).toBeUndefined();

    await act(async () => { answers[1]([reminder('r1'), reminder('r2', 'Walk')]); });

    expect(ok).toBe(true);
    expect(data.reminders.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  // The sign-in load counts the answer it got, even through a replacement.
  it('a sign-in load whose list a failed refresh replaced counts as failed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const answers = [];
    get.mockImplementation((path) => (path === '/reminders'
      ? new Promise((resolve, reject) => { answers.push({ resolve, reject }); })
      : answer(path)));
    await act(async () => { tree = TestRenderer.create(element()); });
    expect(answers).toHaveLength(1);
    await act(async () => { data.refreshReminders(); });

    await act(async () => { answers[1].reject(new Error('Network error')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1/2 domains failed'));
    expect(data.lastSyncedAt).toBeNull();
    warn.mockRestore();
  });
});

// Scheduling cancels every notification then schedules a list, one await at
// a time: lists landing meanwhile wait, and only the newest is scheduled.
describe('scheduling', () => {
  it('one list at a time, and only the newest of those waiting', async () => {
    await mount();
    let finishFirst;
    scheduleLocalReminders.mockClear();
    scheduleLocalReminders.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    const key = ['reminders', 'u1'];

    await act(async () => { client.setQueryData(key, [reminder('a')]); });
    await act(async () => { client.setQueryData(key, [reminder('b')]); });
    await act(async () => { client.setQueryData(key, [reminder('c')]); });
    expect(scheduleLocalReminders.mock.calls).toEqual([[[reminder('a')]]]);

    await act(async () => { finishFirst(); });

    expect(scheduleLocalReminders.mock.calls).toEqual([[[reminder('a')]], [[reminder('c')]]]);
  });

  // A local write changes the schedule but isn't a sync with the server.
  it('a local write reschedules without stamping the sync time', async () => {
    await mount();
    const syncedAt = data.lastSyncedAt;
    const now = jest.spyOn(Date, 'now').mockReturnValue(syncedAt + 60000);

    await act(async () => { client.setQueryData(['reminders', 'u1'], [reminder('x')]); });

    expect(scheduleLocalReminders).toHaveBeenLastCalledWith([reminder('x')]);
    expect(data.lastSyncedAt).toBe(syncedAt);
    now.mockRestore();
  });
});

describe('accounts', () => {
  it('drops the list at logout', async () => {
    await mount();
    mockUser = null;
    await act(async () => { tree.update(element()); });

    expect(data.reminders).toEqual([]);
    expect(client.getQueryCache().findAll({ queryKey: ['reminders'] })).toHaveLength(0);
  });

  // The signed-out account's reminders must not be put back on the phone.
  it('a late answer after logout schedules nothing', async () => {
    await mount();
    let answerLate;
    get.mockImplementation((path) => (path === '/reminders'
      ? new Promise((resolve) => { answerLate = resolve; })
      : answer(path)));
    await act(async () => { data.refreshReminders(); });
    scheduleLocalReminders.mockClear();
    mockUser = null;
    await act(async () => { tree.update(element()); });

    await act(async () => { answerLate([reminder('r9')]); });

    expect(scheduleLocalReminders).not.toHaveBeenCalled();
    expect(client.getQueryCache().findAll({ queryKey: ['reminders'] })).toHaveLength(0);
  });

  // Signed out and back in as the same account before an old answer lands:
  // the old request's list must not replace the new one on the phone.
  it('an answer from before a sign-out never schedules, even for the same account', async () => {
    await mount();
    let answerLate;
    get.mockImplementation((path) => (path === '/reminders' && !answerLate
      ? new Promise((resolve) => { answerLate = resolve; })
      : answer(path)));
    await act(async () => { data.refreshReminders(); });
    mockUser = null;
    await act(async () => { tree.update(element()); });
    server = [reminder('r2', 'New')];
    mockUser = { id: 'u1' };
    await act(async () => { tree.update(element()); });
    expect(data.reminders.map((r) => r.id)).toEqual(['r2']);
    scheduleLocalReminders.mockClear();

    await act(async () => { answerLate([reminder('r1', 'Old')]); });

    expect(scheduleLocalReminders).not.toHaveBeenCalled();
    expect(data.reminders.map((r) => r.id)).toEqual(['r2']);
  });

  // A save that answers after logout must not fetch the signed-out account's
  // list back into the cache (kept for good) and onto the phone.
  it('a refresh asked for after logout fetches nothing', async () => {
    await mount();
    let answerSave;
    post.mockImplementation(() => new Promise((resolve) => { answerSave = resolve; }));
    let saving;
    await act(async () => { saving = data.addReminder({ title: 'Walk' }); });
    mockUser = null;
    await act(async () => { tree.update(element()); });
    const before = reminderCalls();
    scheduleLocalReminders.mockClear();

    await act(async () => { answerSave({}); await saving; });

    expect(reminderCalls()).toBe(before);
    expect(client.getQueryCache().findAll({ queryKey: ['reminders'] })).toHaveLength(0);
    expect(scheduleLocalReminders).not.toHaveBeenCalled();
  });

  // A sign-out that finished with the account still signed in must not leave
  // every later expired request ignored.
  it('a sign-out that left the account signed in can be tried again', async () => {
    await mount();
    get.mockImplementation((path) => (path === '/reminders' ? Promise.reject(new Error('SESSION_EXPIRED')) : answer(path)));
    await act(async () => { await data.refreshReminders(); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    await act(async () => { await data.refreshReminders(); });

    expect(mockLogout).toHaveBeenCalledTimes(2);
  });

  // The reminders query and the refresh's own error handling both meet it.
  it('an expired session met by a refresh signs out once', async () => {
    await mount();
    get.mockImplementation((path) => (path === '/reminders' ? Promise.reject(new Error('SESSION_EXPIRED')) : answer(path)));

    await act(async () => { await data.refreshReminders(); });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
