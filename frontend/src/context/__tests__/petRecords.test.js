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
const mockLogout = jest.fn();
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

import { DataProvider, useData } from '../DataContext';
import { usePetRecords, usePetRecordsQuery } from '../../hooks/usePetRecords';
import { usePetsQuery } from '../../hooks/usePets';
import { get, post, patch, del } from '../../services/api';

const PET = { id: 'p1', owner_id: 'u1', name: 'Rex', type: 'dog' };
const MEDS = [
  { id: 'm1', pet_id: 'p1', name: 'Apoquel', frequency: 'daily' },
  { id: 'm2', pet_id: 'p1', name: 'Fish oil', frequency: 'daily' },
];

let data;
function Probe() {
  data = { ...useData(), pets: usePetRecords() };
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
  // Pet screens read them with usePetRecords: one way in, not two.
  it('are read through usePetRecords, not useData', async () => {
    let fromContext;
    function ContextProbe() {
      fromContext = useData();
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <ContextProbe />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });

    expect(fromContext).not.toHaveProperty('pets');
    expect(data.pets.map((p) => p.name)).toEqual(['Rex']);
  });

  // DataContext no longer holds the records, so a pet write doesn't re-render
  // the screens that read it (feed, invites, settings...).
  it('a pet write does not re-render useData() screens', async () => {
    let renders = 0;
    function ContextProbe() {
      useData();
      renders += 1;
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <ContextProbe />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });
    const before = renders;
    post.mockResolvedValue({ id: 'f1', pet_id: 'p1', name: 'Tuna' });

    await act(async () => { await data.addFavoriteFood('p1', 'Tuna'); });

    expect(data.pets[0].favoriteFoods.map((f) => f.name)).toEqual(['Tuna']);
    expect(renders).toBe(before);
  });

  it('holds the loaded pets where query hooks can read them', async () => {
    await mount();

    expect(data.pets.map((p) => p.name)).toEqual(['Rex']);
    expect(client.getQueryData(['petRecords', 'u1'])).toBe(data.pets);
  });

  // useData().pets reads them without a query observer: nothing may
  // garbage-collect them. A failed load says so at once, without retries.
  it('are never garbage-collected, and not retried', async () => {
    await mount();

    expect(client.getQueryCache().find({ queryKey: ['petRecords', 'u1'] }).options)
      .toEqual(expect.objectContaining({ gcTime: Infinity, retry: false }));
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

// The records are a query: the sign-in load and a screen's hook share it.
describe('the records query', () => {
  const calls = (path) => get.mock.calls.filter(([p]) => p === path).length;
  function PetsTab() {
    usePetRecordsQuery();
    return null;
  }

  // The Pets tab mounts with Home at sign-in: one 1 + 6N load between them,
  // and Home's early names come from that load's own /pets answer.
  it('runs one load at sign-in, whoever asks first', async () => {
    let early;
    function Home() {
      ({ data: early } = usePetsQuery());
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <PetsTab />
            <Home />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });

    expect(calls('/pets/p1/vaccinations')).toBe(1);
    expect(calls('/pets/p1/medications')).toBe(1);
    expect(calls('/pets')).toBe(1);
    // A query observer gets the cache's answer on a setTimeout(0) tick.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(early.map((p) => p.name)).toEqual(['Rex']);
    expect(data.pets.map((p) => p.id)).toEqual(['p1']);
  });

  // Accepting a shared pet reloads everything, even records loaded moments ago.
  it('a full reload re-reads records that are still fresh', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60 * 1000 } } });
    await mount();
    expect(calls('/pets/p1/medications')).toBe(1);
    post.mockResolvedValue({});

    await act(async () => { await data.acceptInvite('i1'); });

    expect(calls('/pets/p1/medications')).toBe(2);
  });

  // A reload after a change the server just made (accepting a shared pet)
  // must not take the answer of a fetch that started before it.
  it('a reload does not join a fetch that predates it', async () => {
    let refetchTab;
    function Tab() {
      ({ refetch: refetchTab } = usePetRecordsQuery());
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <Tab />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });
    // A focus re-read starts, and its pets list predates the shared pet.
    let answerOld;
    get.mockImplementation((path) => {
      if (path === '/pets' && !answerOld) return new Promise((resolve) => { answerOld = () => resolve([PET]); });
      if (path === '/pets') return Promise.resolve([PET, { id: 'p2', owner_id: 'u2', name: 'Milo', type: 'cat' }]);
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    await act(async () => { refetchTab(); });
    post.mockResolvedValue({});

    let accepting;
    await act(async () => { accepting = data.acceptInvite('i1'); });
    await act(async () => { answerOld(); await accepting; });

    expect(data.pets.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  // A screen's re-read during a full reload replaces the reload's fetch:
  // React Query hands the reload the new answer, and the reload still
  // reports a partial load.
  it('a reload whose fetch a screen replaced still reports', async () => {
    let refetchTab;
    function Tab() {
      ({ refetch: refetchTab } = usePetRecordsQuery());
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <Tab />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let held = false;
    get.mockImplementation((path) => {
      if (path === '/pets/p1/weights' && !held) { held = true; return new Promise(() => {}); }
      if (path === '/pets/p1/weights') return Promise.reject(new Error('Network error'));
      if (path === '/pets') return Promise.resolve([PET]);
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    post.mockResolvedValue({});

    let accepting;
    await act(async () => { accepting = data.acceptInvite('i1'); });
    // The reload's own fetch is running (its weights request held) before the
    // screen re-reads.
    for (let i = 0; i < 20 && !held; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    expect(held).toBe(true);
    await act(async () => { refetchTab(); });
    await act(async () => { await accepting; });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1/2 domains failed'));
    warn.mockRestore();
  });

  // A change made while a screen's re-read runs must not be undone by it.
  it('a change during a screen\'s re-read survives it', async () => {
    let refetchTab;
    function Tab() {
      ({ refetch: refetchTab } = usePetRecordsQuery());
      return null;
    }
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <Tab />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });
    const newW = { id: 'w1', pet_id: 'p1', weight: 21, unit: 'kg', logged_at: '2026-10-22T08:00:00Z' };
    let answerOld;
    let saved = false;
    get.mockImplementation((path) => {
      if (path === '/pets/p1/weights' && !answerOld) return new Promise((resolve) => { answerOld = () => resolve([]); });
      if (path === '/pets/p1/weights') return Promise.resolve(saved ? [newW] : []);
      if (path === '/pets') return Promise.resolve([PET]);
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    await act(async () => { refetchTab(); });
    post.mockImplementation(() => { saved = true; return Promise.resolve(newW); });

    await act(async () => { await data.addWeight('p1', { weight: '21' }); });
    await act(async () => { answerOld(); await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(data.pets[0].weights.map((w) => w.id)).toEqual(['w1']);
  });

  // The records query and the sign-in load both meet the expired session.
  it('an expired session signs out once', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockImplementation((path) => (path === '/pets'
      ? Promise.reject(new Error('SESSION_EXPIRED'))
      : Promise.resolve([])));
    await act(async () => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <PetsTab />
            <Probe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
    console.warn.mockRestore();
  });
});

// Each change to one pet applies to that pet as it is in the cache now, not
// as the screen last rendered it.
// A sign-out that failed must not leave every later expired request ignored.
describe('an expired session', () => {
  it('a sign-out that failed is tried again by the next expired request', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLogout.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    get.mockImplementation((path) => (path === '/pets' ? Promise.reject(new Error('SESSION_EXPIRED')) : Promise.resolve([])));
    await mount();
    // The query met the expiry first and its sign-out failed; the sign-in
    // load, meeting the same expiry, tries again.
    expect(mockLogout).toHaveBeenCalledTimes(2);
    console.warn.mockRestore();
  });
});

describe('changes to one pet', () => {
  it('a new pet with a weight shows the log the server created', async () => {
    await mount();
    post.mockResolvedValue({ id: 'p2', owner_id: 'u1', name: 'Milo', type: 'cat', weight: 4 });
    get.mockImplementation((path) => (path === '/pets/p2/weights'
      ? Promise.resolve([{ id: 'w1', pet_id: 'p2', weight: 4, unit: 'kg', logged_at: '2026-10-22T08:00:00Z' }])
      : Promise.resolve([])));

    await act(async () => { await data.addPet({ name: 'Milo', weight: '4' }); });

    expect(data.pets.find((p) => p.id === 'p2').weights.map((w) => w.id)).toEqual(['w1']);
  });

  it('two weights logged at once both land', async () => {
    await mount();
    post
      .mockResolvedValueOnce({ id: 'w1', pet_id: 'p1', weight: 20, unit: 'kg', logged_at: '2026-10-21T08:00:00Z' })
      .mockResolvedValueOnce({ id: 'w2', pet_id: 'p1', weight: 21, unit: 'kg', logged_at: '2026-10-22T08:00:00Z' });

    await act(async () => { await Promise.all([data.addWeight('p1', { weight: '20' }), data.addWeight('p1', { weight: '21' })]); });

    expect(data.pets[0].weights.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(data.pets[0].weight).toBe('21');
  });

  // A medication added from the same render must not undo a dose just logged.
  it('a logged dose survives a medication added after it', async () => {
    await mount();
    post
      .mockResolvedValueOnce({ administered_at: '2026-10-22T08:00:00Z' })
      .mockResolvedValueOnce({ id: 'm3', pet_id: 'p1', name: 'Vitamins', frequency: 'daily' });

    await act(async () => {
      await data.logMedicationDose('p1', 'm1');
      await data.addMedication('p1', { name: 'Vitamins', frequency: 'daily' });
    });

    const meds = data.pets[0].medications;
    expect(meds.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(meds[0].lastAdministeredAt).toBe('2026-10-22T08:00:00Z');
  });

  // The weight re-read after an edit must not put the old name back.
  it('an edit survives the weight re-read it starts', async () => {
    await mount();
    patch.mockResolvedValue({ ...PET, name: 'Max', weight: 10 });
    get.mockImplementation((path) => (path === '/pets/p1/weights'
      ? Promise.resolve([{ id: 'w1', pet_id: 'p1', weight: 10, unit: 'kg', logged_at: '2026-10-22T08:00:00Z' }])
      : Promise.resolve([])));

    await act(async () => { await data.updatePet('p1', { name: 'Max', weight: '10' }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(data.pets[0].name).toBe('Max');
    expect(data.pets[0].weights.map((w) => w.id)).toEqual(['w1']);
  });

  // Saved on the server: no "couldn't save" because the pet isn't listed.
  it('a change to a pet no longer listed still counts as saved', async () => {
    await mount();
    post.mockResolvedValue({ id: 'f1', pet_id: 'p9', name: 'Tuna' });

    let ok;
    await act(async () => { ok = await data.addFavoriteFood('p9', 'Tuna'); });

    expect(ok).toBe(true);
    expect(data.pets.map((p) => p.id)).toEqual(['p1']);
  });
});

// Logout removes the records; nothing that answers late may bring them back.
describe('after logout', () => {
  const records = () => client.getQueryCache().findAll({ queryKey: ['petRecords'] });

  it('a sign-in load that finishes late writes nothing', async () => {
    let answerPets;
    get.mockImplementation((path) => {
      if (path === '/pets') return new Promise((resolve) => { answerPets = () => resolve([PET]); });
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    await mount();
    // Watching from before the logout: removing the query cancels the load.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUser = null;
    await act(async () => { tree.update(element()); });

    await act(async () => { answerPets(); });

    expect(records()).toHaveLength(0);
    expect(data.pets).toEqual([]);
    // Nothing to report: the load was for an account no longer signed in.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a mutation that answers late writes nothing', async () => {
    await mount();
    let answerAdd;
    post.mockImplementation(() => new Promise((resolve) => { answerAdd = resolve; }));
    let adding;
    await act(async () => { adding = data.addPet({ name: 'Milo' }); });
    mockUser = null;
    await act(async () => { tree.update(element()); });

    await act(async () => { answerAdd({ id: 'p2', owner_id: 'u1', name: 'Milo', type: 'cat' }); await adding; });

    expect(records()).toHaveLength(0);
  });

  // Not the same as "no list yet": a failed first load still shows a pet
  // added afterwards, as before.
  it('a failed first load still shows a pet added afterwards', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockImplementation((path) => (path === '/pets' ? Promise.reject(new Error('Network error')) : Promise.resolve([])));
    await mount();
    expect(data.pets).toEqual([]);
    post.mockResolvedValue({ id: 'p2', owner_id: 'u1', name: 'Milo', type: 'cat' });

    await act(async () => { await data.addPet({ name: 'Milo' }); });

    expect(data.pets.map((p) => p.id)).toEqual(['p2']);
    console.warn.mockRestore();
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
