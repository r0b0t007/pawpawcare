import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// CHW-245: a save refused by a per-pet limit still resolves false (the
// contract every screen relies on), but the server's own explanation is kept
// for the screen's failure toast — once — instead of a generic "couldn't save".
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
import { get, post, patch } from '../../services/api';

const PET = { id: 'p1', owner_id: 'u1', name: 'Rex', type: 'dog' };
const MED = { id: 'm1', pet_id: 'p1', name: 'Pill', frequency: 'daily', times: ['09:00'], active: false };
const LIMIT = 'This pet already has 30 medications with reminders. Stop or delete one to add another.';

const apiError = (status, message, code) => Object.assign(new Error(message), { status, code });

let data;
let tree;
function Probe() {
  data = useData();
  return null;
}

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((path) => {
    if (path === '/pets') return Promise.resolve([PET]);
    if (/\/pets\/p1\/medications$/.test(path)) return Promise.resolve([MED]);
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
      </QueryClientProvider>,
    );
  });
  await act(async () => {});
}

test.each([
  ['addMedication', () => data.addMedication('p1', { name: 'More', frequency: 'daily' }), post],
  ['addVaccination', () => data.addVaccination('p1', { name: 'Rabies', dueDate: '2099-01-01' }), post],
  ['updateMedication', () => data.updateMedication('p1', 'm1', { active: true }), patch],
])('%s at the limit: false, and the server says why, once', async (_, save, call) => {
  await mount();
  call.mockRejectedValue(apiError(422, LIMIT, 'pet_limit_reached'));

  let result;
  await act(async () => { result = await save(); });

  expect(result).toBe(false);
  expect(data.takeFailureNote()).toBe(LIMIT);
  expect(data.takeFailureNote()).toBeNull();
});

test('any other failure leaves no note, so screens keep their own message', async () => {
  await mount();
  post.mockRejectedValueOnce(apiError(422, LIMIT, 'pet_limit_reached'));
  post.mockRejectedValueOnce(apiError(500, 'Server error'));

  await act(async () => { await data.addMedication('p1', { name: 'A' }); });
  await act(async () => { await data.addMedication('p1', { name: 'B' }); });

  expect(data.takeFailureNote()).toBeNull();
});
