import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Screens read the reminders list with useReminders (no fetch of its own),
// re-read it on focus once stale, and reschedule through DataContext's one
// scheduler. useData() no longer holds the list.
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
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, logout: jest.fn() }),
}));
// Focus is driven by the test: the latest focus callback is kept.
let mockFocus;
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => { mockFocus = callback; } }));

import { DataProvider, useData } from '../../context/DataContext';
import { useReminders, useRefreshRemindersOnFocus, REMINDERS_STALE_MS } from '../useReminders';
import { get } from '../../services/api';
import { scheduleLocalReminders } from '../../services/notifications';

const reminder = (id) => ({ id, title: `Reminder ${id}`, enabled: true, next_fire_at: '2030-01-01T09:00:00Z' });

let server;
let data;
let reminders;
function Screen() {
  data = useData();
  reminders = useReminders();
  useRefreshRemindersOnFocus();
  return null;
}

let tree;
let client;
const mount = () => act(async () => {
  tree = TestRenderer.create(
    <QueryClientProvider client={client}>
      <DataProvider>
        <Screen />
      </DataProvider>
    </QueryClientProvider>,
  );
});
const reminderCalls = () => get.mock.calls.filter(([path]) => path === '/reminders').length;
const focus = () => act(async () => { mockFocus(); });

beforeEach(() => {
  jest.clearAllMocks();
  server = [reminder('r1')];
  get.mockImplementation((path) => {
    if (path === '/reminders') return Promise.resolve(server);
    if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
    return Promise.resolve([]);
  });
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('reading the list', () => {
  it('reads the list the sign-in load fetched, without a request of its own', async () => {
    await mount();

    expect(reminders.map((r) => r.id)).toEqual(['r1']);
    expect(reminderCalls()).toBe(1);
  });

  it('is no longer part of useData()', async () => {
    await mount();

    expect(data).not.toHaveProperty('reminders');
  });
});

describe('re-reading on focus', () => {
  it('leaves a fresh list alone', async () => {
    await mount();
    await focus();
    await focus();

    expect(reminderCalls()).toBe(1);
  });

  // Reading never fetches: a screen opened on a stale list re-reads it.
  it('re-reads a stale list when a screen opens on it', async () => {
    await mount();
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + REMINDERS_STALE_MS + 1000);

    await focus();
    now.mockRestore();

    expect(reminderCalls()).toBe(2);
  });

  // A co-owner's reminder made on another phone shows once the list is stale.
  it('re-reads a stale list when the screen is shown again', async () => {
    await mount();
    await focus();
    server = [reminder('r1'), reminder('r2')];
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + REMINDERS_STALE_MS + 1000);

    await focus();
    now.mockRestore();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(reminderCalls()).toBe(2);
    expect(reminders.map((r) => r.id)).toEqual(['r1', 'r2']);
    // The new list reschedules, through the one listener.
    expect(scheduleLocalReminders).toHaveBeenLastCalledWith(server);
  });
});

// A permission grant or the care-reminders toggle: the current list, through
// the same one-at-a-time scheduler.
describe('rescheduling', () => {
  it('schedules the current list', async () => {
    await mount();
    scheduleLocalReminders.mockClear();

    await act(async () => { data.rescheduleReminders(); });

    expect(scheduleLocalReminders.mock.calls).toEqual([[server]]);
  });

  it('waits for a schedule already running, then schedules the newest', async () => {
    await mount();
    let finish;
    scheduleLocalReminders.mockClear();
    scheduleLocalReminders.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { data.rescheduleReminders(); });
    await act(async () => { client.setQueryData(['reminders', 'u1'], [reminder('r9')]); });
    expect(scheduleLocalReminders).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); });

    expect(scheduleLocalReminders.mock.calls).toEqual([[server], [[reminder('r9')]]]);
  });
});
