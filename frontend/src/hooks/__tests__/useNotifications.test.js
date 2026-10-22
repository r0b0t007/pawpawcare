import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The in-app notification list, through React Query. Marking read, snoozing
// and dismissing stay DataContext mutations that re-read it before resolving.
jest.mock('../../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
  uploadDocument: jest.fn(),
}));
const mockListeners = {};
jest.mock('../../services/notifications', () => ({
  scheduleLocalReminders: jest.fn(() => Promise.resolve()),
  addNotificationReceivedListener: (handler) => { mockListeners.received = handler; return { remove: jest.fn() }; },
  addNotificationResponseListener: (handler) => { mockListeners.tapped = handler; return { remove: jest.fn() }; },
}));
jest.mock('../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../services/prefs', () => ({
  getPref: jest.fn(() => Promise.resolve({})),
  setPref: jest.fn(() => Promise.resolve()),
}));
let mockUser = { id: 'u1', locale: 'en' };
const mockLogout = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

import { DataProvider, useData } from '../../context/DataContext';
import { AppState } from 'react-native';
import { useNotificationsQuery, useUnreadCount, NotificationsRefresher } from '../useNotifications';
import { get, post } from '../../services/api';

const item = (id, extra = {}) => ({
  id, title: `Reminder ${id}`, body: null, read_at: null, created_at: '2026-10-22T09:00:00Z', ...extra,
});

let server;
let data;
let list;
let unread;
function Probe() {
  data = useData();
  // React Query re-renders only for the fields read during render, so read
  // them here the way the screens destructure them.
  const { data: answer, isError } = useNotificationsQuery();
  list = { data: answer, isError };
  ({ data: unread } = useUnreadCount());
  return null;
}
function DataOnly() {
  data = useData();
  return null;
}

let tree;
let client;
const element = (Child = Probe) => (
  <QueryClientProvider client={client}>
    <DataProvider>
      <Child />
    </DataProvider>
  </QueryClientProvider>
);

const calls = (path) => get.mock.calls.filter(([p]) => p === path).length;
const answer = (path) => (path === '/notifications' ? Promise.resolve(server) : Promise.resolve([]));

// React Query hands results to components on a setTimeout(0) tick, which an
// async act() alone doesn't wait for: run the step, then let a few ticks pass.
async function settle(step) {
  await act(async () => { await step?.(); });
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
const mount = (Child) => settle(() => { tree = TestRenderer.create(element(Child)); });
const rerender = () => settle(() => { tree.update(element()); });
const ids = () => list.data.notifications.map((n) => n.id);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  server = { notifications: [item('n1'), item('n2', { read_at: '2026-10-22T10:00:00Z' })], unread_count: 1 };
  get.mockImplementation(answer);
  // gcTime: Infinity schedules no garbage-collection timers, which would keep
  // Jest from exiting; clear() drops the cache between tests.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('reading notifications', () => {
  it('fetches the list once, with its unread count, for the screen and the bell', async () => {
    await mount();

    expect(calls('/notifications')).toBe(1);
    expect(ids()).toEqual(['n1', 'n2']);
    expect(list.data.unreadCount).toBe(1);
    expect(unread).toBe(1);
  });

  it('reads a missing list or count as none', async () => {
    server = {};
    await mount();

    expect(list.data).toEqual({ notifications: [], unreadCount: 0 });
    expect(unread).toBe(0);
  });

  it('is not part of the full load', async () => {
    await mount(DataOnly);

    expect(get.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining(['/pets', '/reminders']));
    expect(calls('/notifications')).toBe(0);
  });

  // The screen shows a retry, and the bell no dot, rather than "all caught up".
  it('reports a failed load as an error, not as no notifications', async () => {
    get.mockImplementation((path) => (path === '/notifications' ? Promise.reject(new Error('Network error')) : answer(path)));
    await mount();

    expect(list).toEqual({ data: undefined, isError: true });
    expect(unread).toBeUndefined();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('re-reading the list', () => {
  // Home's bell fetched it moments ago; a push arrived since. The inbox is
  // where a tapped push lands, so it re-reads on opening anyway.
  it('the inbox re-reads when it opens, even when the bell just fetched', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60 * 1000 } } });
    function Bell() {
      data = useData();
      ({ data: unread } = useUnreadCount());
      return null;
    }
    await mount(Bell);
    expect(calls('/notifications')).toBe(1);

    await settle(() => { tree.update(element(Probe)); });
    expect(calls('/notifications')).toBe(2);
  });

  // New notifications are created on the server while the list is cached.
  it('re-reads when a notification is shown, tapped, or the app comes back', async () => {
    // DataContext listens too (the day roll): call every listener.
    const handlers = [];
    // Swapped by hand: the preset's AppState mock must come back intact.
    const original = AppState.addEventListener;
    AppState.addEventListener = (_, handler) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    };
    const onAppState = (state) => handlers.forEach((h) => h(state));
    await settle(() => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <Probe />
            <NotificationsRefresher />
          </DataProvider>
        </QueryClientProvider>,
      );
    });
    const before = calls('/notifications');

    await settle(() => mockListeners.received({}));
    expect(calls('/notifications')).toBe(before + 1);
    await settle(() => mockListeners.tapped({}));
    expect(calls('/notifications')).toBe(before + 2);
    await settle(() => onAppState('background'));
    expect(calls('/notifications')).toBe(before + 2);
    await settle(() => onAppState('active'));
    expect(calls('/notifications')).toBe(before + 3);
    act(() => tree.unmount());
    tree = undefined;
    AppState.addEventListener = original;
  });

  // A full reload (accepting a shared pet) re-reads notifications too.
  it('a full reload re-reads it', async () => {
    await mount();
    post.mockResolvedValue({});

    await settle(() => data.acceptInvite('i1'));

    expect(calls('/notifications')).toBe(2);
  });
});

describe('accounts', () => {
  it('never shows the previous account’s notifications to the next one', async () => {
    await mount();
    get.mockImplementation((path) => (path === '/notifications' ? new Promise(() => {}) : answer(path)));
    mockUser = { id: 'u2', locale: 'en' };
    await rerender();

    expect(list.data).toBeUndefined();
    expect(unread).toBeUndefined();
  });

  it('drops the cached list at logout', async () => {
    await mount();
    const cached = () => client.getQueryCache().findAll({ queryKey: ['notifications'] }).filter((q) => q.state.data);
    expect(cached()).toHaveLength(1);

    mockUser = null;
    await rerender();

    expect(cached()).toHaveLength(0);
  });
});

describe('acting on a notification', () => {
  // The answer is written straight away: no re-read (and its retries on a
  // flaky link) between the tap and the row turning read.
  it('marking read shows it read at once, with the bell, without a re-read', async () => {
    await mount();
    post.mockResolvedValue(item('n1', { read_at: '2026-10-22T11:00:00Z' }));
    get.mockImplementation((path) => (path === '/notifications' ? new Promise(() => {}) : answer(path)));

    let ok;
    await settle(async () => { ok = await data.markNotificationRead('n1'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/notifications/n1/read');
    expect(list.data.notifications[0].read_at).toBe('2026-10-22T11:00:00Z');
    expect(list.data.unreadCount).toBe(0);
    expect(unread).toBe(0);
    expect(calls('/notifications')).toBe(1);
  });

  // Snoozing moves the reminder too.
  it('snoozing shows the snooze and re-reads the reminders', async () => {
    await mount();
    post.mockResolvedValue(item('n1', { status: 'snoozed', snoozed_until: '2026-10-22T12:00:00Z' }));
    const remindersBefore = calls('/reminders');

    let ok;
    await settle(async () => { ok = await data.snoozeNotification('n1', 30); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/notifications/n1/snooze', { minutes: 30 });
    expect(list.data.notifications[0].snoozed_until).toBe('2026-10-22T12:00:00Z');
    expect(list.data.unreadCount).toBe(1);
    expect(calls('/notifications')).toBe(1);
    expect(calls('/reminders')).toBe(remindersBefore + 1);
  });

  it('dismissing takes it off the list and out of the count', async () => {
    await mount();
    post.mockResolvedValue(null);

    let ok;
    await settle(async () => { ok = await data.dismissNotification('n1'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/notifications/n1/dismiss');
    expect(ids()).toEqual(['n2']);
    expect(unread).toBe(0);
    expect(calls('/notifications')).toBe(1);
  });

  it('a failed action resolves false and re-reads nothing', async () => {
    await mount();
    post.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.dismissNotification('n1'); });

    expect(ok).toBe(false);
    expect(calls('/notifications')).toBe(1);
    expect(ids()).toEqual(['n1', 'n2']);
  });
});
