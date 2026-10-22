import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The full pet records live in the React Query cache (petRecordsKeys), with
// useData().pets reading them. Each write must behave as the reducer's did:
// applied to the current list, at once, and gone at logout.
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
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn() }),
}));

import { DataProvider, useData } from '../DataContext';
import { get, post, del } from '../../services/api';

const PET = { id: 'p1', owner_id: 'u1', name: 'Rex', type: 'dog' };
const MEDS = [
  { id: 'm1', pet_id: 'p1', name: 'Apoquel', frequency: 'daily' },
  { id: 'm2', pet_id: 'p1', name: 'Fish oil', frequency: 'daily' },
];

let data;
function Probe() {
  data = useData();
  return null;
}

let tree;
let client;
let vaccinations;
const element = () => (
  <QueryClientProvider client={client}>
    <DataProvider>
      <Probe />
    </DataProvider>
  </QueryClientProvider>
);
const mount = () => act(async () => { tree = TestRenderer.create(element()); });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
  vaccinations = [];
  get.mockImplementation((path) => {
    if (path === '/pets') return Promise.resolve([PET]);
    if (path === '/pets/p1/medications') return Promise.resolve(MEDS);
    if (path === '/pets/p1/vaccinations') return Promise.resolve(vaccinations);
    if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
    return Promise.resolve([]);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('pet records in the cache', () => {
  it('holds the loaded pets where query hooks can read them', async () => {
    await mount();

    expect(data.pets.map((p) => p.name)).toEqual(['Rex']);
    expect(client.getQueryData(['petRecords', 'u1'])).toBe(data.pets);
  });

  // They are filled by the sign-in load, not fetched by a query of their own:
  // nothing may garbage-collect them while no hook observes them.
  it('are never garbage-collected or stale', async () => {
    await mount();

    expect(client.getQueryCache().find({ queryKey: ['petRecords', 'u1'] }).options)
      .toEqual(expect.objectContaining({ gcTime: Infinity, staleTime: Infinity }));
  });

  // Two pets added at once both land: each write applies to the current
  // list, not to the one the screen last rendered.
  it('two writes at once both land', async () => {
    await mount();
    post
      .mockResolvedValueOnce({ id: 'p2', owner_id: 'u1', name: 'Milo', type: 'cat' })
      .mockResolvedValueOnce({ id: 'p3', owner_id: 'u1', name: 'Coco', type: 'dog' });

    await act(async () => { await Promise.all([data.addPet({ name: 'Milo' }), data.addPet({ name: 'Coco' })]); });

    expect(data.pets.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('a logged dose is on its medication', async () => {
    await mount();
    post.mockResolvedValue({ administered_at: '2026-10-22T08:00:00Z' });

    await act(async () => { await data.logMedicationDose('p1', 'm2'); });

    expect(data.pets[0].medications.map((m) => [m.id, m.lastAdministeredAt ?? null]))
      .toEqual([['m1', null], ['m2', '2026-10-22T08:00:00Z']]);
  });

  it('a deleted pet leaves the list', async () => {
    await mount();
    del.mockResolvedValue(null);

    await act(async () => { await data.deletePet('p1'); });

    expect(data.pets).toEqual([]);
  });

  it('are dropped at logout', async () => {
    await mount();
    expect(data.pets).toHaveLength(1);

    mockUser = null;
    await act(async () => { tree.update(element()); });

    expect(data.pets).toEqual([]);
    expect(client.getQueryCache().findAll({ queryKey: ['petRecords'] })).toHaveLength(0);
  });
});

// A vaccination due tomorrow is "due soon" today, and must read "overdue" once
// the day rolls over while the app stays open — without a reload.
describe('the day rolling over', () => {
  const REAL_TIMERS = [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate',
    'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
  ];
  let original;
  let handlers;
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-15T10:00:00'), doNotFake: REAL_TIMERS });
    // Swapped by hand: the preset's AppState mock must come back intact.
    original = AppState.addEventListener;
    handlers = [];
    AppState.addEventListener = (_, handler) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    };
  });
  afterEach(() => {
    AppState.addEventListener = original;
    jest.useRealTimers();
  });

  it('re-derives vaccination statuses on coming back to the app', async () => {
    vaccinations = [{ id: 'v1', pet_id: 'p1', name: 'Rabies', status: 'upcoming', due_date: '2026-10-16' }];
    await mount();
    expect(data.pets[0].vaccinations[0].status).toBe('due_soon');
    const before = data.pets;

    jest.setSystemTime(new Date('2026-10-17T09:00:00'));
    await act(async () => { handlers.forEach((h) => h('active')); });

    expect(data.pets[0].vaccinations[0].status).toBe('overdue');
    expect(data.pets).not.toBe(before);
  });

  it('leaves the list as it is when no status changes', async () => {
    vaccinations = [{ id: 'v1', pet_id: 'p1', name: 'Rabies', status: 'completed', due_date: '2026-10-16' }];
    await mount();
    const before = data.pets;

    jest.setSystemTime(new Date('2026-10-17T09:00:00'));
    await act(async () => { handlers.forEach((h) => h('active')); });

    expect(data.pets).toBe(before);
  });
});
