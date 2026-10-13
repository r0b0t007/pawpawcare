import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Only the initial load is under test, so every side-effecting collaborator is
// stubbed and `get` is driven per-endpoint by the test itself.
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
const mockLogout = jest.fn();
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, logout: mockLogout }),
}));

import { DataProvider, useData } from '../DataContext';
import { get } from '../../services/api';
import { getPref, setPref } from '../../services/prefs';

const PET = { id: 'p1', owner_id: 'u1', name: 'Rex', type: 'dog' };
const HEAVY = /\/pets\/p1\/(activities|foods|medications|weights|expenses)$/;

let data;
function Probe() {
  data = useData();
  return null;
}

/**
 * Answers every endpoint with an empty list unless `overrides` maps the path
 * (string or RegExp test) to a value, a rejection, or 'pending'. Pending
 * requests are returned so the test can resolve them.
 */
function mockApi(overrides = []) {
  const pending = [];
  get.mockImplementation((path) => {
    const hit = overrides.find(([match]) => (match instanceof RegExp ? match.test(path) : match === path));
    if (hit) {
      const [, outcome] = hit;
      if (outcome === 'pending') return new Promise((resolve) => pending.push(() => resolve([])));
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve(outcome);
    }
    if (path === '/pets') return Promise.resolve([PET]);
    if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
    return Promise.resolve([]);
  });
  return pending;
}

let tree;
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
}

describe('DataContext initial load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    data = undefined;
  });

  // The provider arms a midnight-rollover timer; unmount so Jest can exit.
  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
    console.warn.mockRestore();
  });

  it('loads pets with all their sub-resources', async () => {
    const pending = mockApi([[HEAVY, 'pending']]);
    await mount();
    expect(data.pets).toHaveLength(0);

    await act(async () => {
      pending.forEach((resolve) => resolve());
    });

    expect(data.pets).toHaveLength(1);
    expect(data.pets[0].activities).toEqual([]);
    expect(data.pets[0].missing).toBeUndefined();
    expect(data.dataLoaded).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  // Seen on the emulator: one dropped request among the 1 + 6N left the store
  // with no pets for the whole session — Home said "Welcome to PawPawCare"
  // and every profile "Pet not found." while the Pets tab still listed them.
  it('keeps the pet when one of its sub-resources fails', async () => {
    mockApi([
      ['/pets/p1/weights', new Error('Network error: timeout')],
      ['/pets/p1/medications', [{ id: 'm1', pet_id: 'p1', name: 'Apoquel' }]],
    ]);
    await mount();

    expect(data.pets).toHaveLength(1);
    expect(data.pets[0].name).toBe('Rex');
    expect(data.pets[0].weights).toEqual([]);
    expect(data.pets[0].missing).toEqual(['weights']);
    expect(data.pets[0].medications).toHaveLength(1);
    // Still reported as a partial load (the pets domain counts as failed).
    expect(data.dataLoaded).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('1/6 domains failed'));
  });

  it('keeps the pet when its vaccinations fail', async () => {
    mockApi([['/pets/p1/vaccinations', new Error('Network error: timeout')]]);
    await mount();

    expect(data.pets).toHaveLength(1);
    // Listed as missing, so screens don't call the pet "all good".
    expect(data.pets[0].missing).toEqual(['vaccinations']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('1/6 domains failed'));
  });

  // Pruning the stored dose history against a pet whose medications never
  // loaded would delete that history for good.
  it("leaves the stored dose history alone when a pet's medications fail", async () => {
    mockApi([['/pets/p1/medications', new Error('Network error: timeout')]]);
    await mount();

    expect(data.pets[0].missing).toEqual(['medications']);
    expect(getPref).not.toHaveBeenCalledWith('medDoseDays', expect.anything());
    expect(setPref).not.toHaveBeenCalledWith('medDoseDays', expect.anything());
  });

  it('hydrates the dose history when medications load', async () => {
    mockApi();
    await mount();

    expect(getPref).toHaveBeenCalledWith('medDoseDays', {});
  });

  // Signs out without waiting on the rest of the requests, and without
  // showing pets for a session that has ended.
  it('signs out as soon as a sub-resource reports an expired session', async () => {
    mockApi([
      ['/pets/p1/foods', new Error('SESSION_EXPIRED')],
      [/\/pets\/p1\/(activities|weights)$/, 'pending'],
    ]);
    await mount();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(data.pets).toHaveLength(0);
  });
});
