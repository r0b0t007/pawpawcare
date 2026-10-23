import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The server adds or removes a vaccination's due-date reminder on every
// vaccination change, so the store must refetch reminders (which also
// reschedules this device's local notifications) — a dose marked given must
// not keep its notification.
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
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, logout: jest.fn() }),
}));

import { DataProvider, useData } from '../DataContext';
import { useReminders } from '../../hooks/useReminders';
import { get, patch, post, del } from '../../services/api';
import { scheduleLocalReminders } from '../../services/notifications';

const PET = { id: 'p1', owner_id: 'u1', name: 'Rex', type: 'dog' };
const VAX = { id: 'v1', pet_id: 'p1', name: 'Rabies', due_date: '2099-07-01', status: 'upcoming' };
const REMINDER = { id: 'r1', title: 'Vaccination due: Rabies', enabled: true, next_fire_at: '2099-06-24T13:00:00Z' };

let data;
let serverReminders;
let tree;
function Probe() {
  data = { ...useData(), reminders: useReminders() };
  return null;
}

// Unmount so the provider clears its timers (midnight rollover) and Jest exits.
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
  data = undefined;
  serverReminders = [REMINDER];
  get.mockImplementation((path) => {
    if (path === '/pets') return Promise.resolve([PET]);
    if (/\/pets\/p1\/vaccinations$/.test(path)) return Promise.resolve([VAX]);
    if (path === '/reminders') return Promise.resolve(serverReminders);
    if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
    return Promise.resolve([]);
  });
});

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    tree = TestRenderer.create(
      <QueryClientProvider client={client}>
        <DataProvider>
          <Probe />
        </DataProvider>
      </QueryClientProvider>
    );
  });
  // Let the initial load settle.
  await act(async () => {});
}

const reminderFetches = () => get.mock.calls.filter(([path]) => path === '/reminders').length;

test('marking a vaccination done refetches reminders and reschedules local notifications', async () => {
  await mount();
  expect(data.reminders).toHaveLength(1);
  const before = reminderFetches();

  serverReminders = []; // the server removed the reminder on completion
  patch.mockResolvedValue({ ...VAX, status: 'completed', administered_date: '2099-06-30' });
  await act(async () => {
    await data.markVaccinationComplete('p1', 'v1');
  });

  expect(reminderFetches()).toBe(before + 1);
  expect(data.reminders).toEqual([]);
  expect(scheduleLocalReminders).toHaveBeenLastCalledWith([]);
});

test('adding and deleting a vaccination refetch reminders too', async () => {
  await mount();
  const before = reminderFetches();

  post.mockResolvedValue({ ...VAX, id: 'v2' });
  await act(async () => {
    await data.addVaccination('p1', { name: 'Lepto', dueDate: '2099-08-01' });
  });
  del.mockResolvedValue(null);
  await act(async () => {
    await data.deleteVaccination('p1', 'v2');
  });

  expect(reminderFetches()).toBe(before + 2);
});

test('an older reminders response arriving last never overwrites the newer one', async () => {
  await mount();
  let resolveOld;
  let resolveNew;
  get.mockImplementation((path) => {
    if (path !== '/reminders') return Promise.resolve([]);
    return new Promise((resolve) => {
      if (!resolveOld) resolveOld = resolve;
      else resolveNew = resolve;
    });
  });

  let older;
  let newer;
  // The older request is in flight when the newer refresh is asked for.
  await act(async () => { older = data.refreshReminders(); });
  expect(resolveOld).toBeDefined();
  await act(async () => { newer = data.refreshReminders(); });
  await act(async () => {
    resolveNew([]); // newest: the reminder is gone
    await newer;
    resolveOld([REMINDER]); // stale: still has it
    await older;
  });

  expect(data.reminders).toEqual([]);
  expect(scheduleLocalReminders).toHaveBeenLastCalledWith([]);
});
