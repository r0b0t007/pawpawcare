import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// A pet's medical records vault, through React Query. Adds, deletes, AI reads
// and applying a reading stay DataContext mutations that write into the cache
// or re-read it.
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
jest.mock('../../services/storeReview', () => ({ noteGoodMoment: jest.fn() }));
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
import { useVaultQuery } from '../useVault';
import { get, post, del, uploadDocument } from '../../services/api';

const clinic = (id, name) => ({ id, pet_id: 'p1', name });
const visit = (id, title) => ({ id, pet_id: 'p1', title, scheduled_at: '2026-11-01T09:00:00Z', status: 'scheduled' });
const doc = (id, title, extra = {}) => ({ id, pet_id: 'p1', title, category: 'lab', created_at: '2026-10-20T10:00:00Z', ...extra });

let server;
let data;
let vault;
function Probe({ petId = 'p1' }) {
  data = useData();
  // React Query re-renders only for the fields read during render, so read
  // them here the way the screen destructures them.
  const { data: records, isError } = useVaultQuery(petId);
  vault = { data: records, isError };
  return null;
}
function DataOnly() {
  data = useData();
  return null;
}

let tree;
let client;
const element = (child = <Probe />) => (
  <QueryClientProvider client={client}>
    <DataProvider>{child}</DataProvider>
  </QueryClientProvider>
);

const VAULT = ['/pets/p1/clinics', '/pets/p1/appointments', '/pets/p1/documents'];
const calls = (path) => get.mock.calls.filter(([p]) => p === path).length;
const reads = () => VAULT.map(calls);
const answer = (path) => {
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  const m = path.match(/^\/pets\/(p\d)\/(clinics|appointments|documents)$/);
  if (m) return Promise.resolve(server[m[1]]?.[m[2]] ?? []);
  return Promise.resolve([]);
};

// React Query hands results to components on a setTimeout(0) tick, which an
// async act() alone doesn't wait for: run the step, then let a few ticks pass.
async function settle(step) {
  await act(async () => { await step?.(); });
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
const mount = (child) => settle(() => { tree = TestRenderer.create(element(child)); });
const rerender = (child) => settle(() => { tree.update(element(child)); });
const ids = (list) => vault.data[list].map((x) => x.id);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  server = {
    p1: {
      clinics: [clinic('c1', 'Riverside Vets')],
      appointments: [visit('a1', 'Check-up')],
      documents: [doc('d1', 'Bloodwork'), doc('d2', 'X-ray')],
    },
    p2: { clinics: [clinic('c9', 'Other clinic')], appointments: [], documents: [] },
  };
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

describe('reading the vault', () => {
  it('fetches a pet’s three lists once, mapped for the screen', async () => {
    await mount();

    expect(reads()).toEqual([1, 1, 1]);
    expect(vault.data.clinics[0]).toEqual(expect.objectContaining({ id: 'c1', name: 'Riverside Vets', vetName: null }));
    expect(vault.data.appointments[0]).toEqual(expect.objectContaining({ id: 'a1', title: 'Check-up' }));
    expect(vault.data.documents.map((d) => [d.id, d.extractionStatus])).toEqual([['d1', 'none'], ['d2', 'none']]);
  });

  it('is not part of the full load', async () => {
    await mount(<DataOnly />);

    expect(reads()).toEqual([0, 0, 0]);
  });

  it('keeps each pet’s vault apart', async () => {
    await mount();
    await rerender(<Probe petId="p2" />);

    expect(ids('clinics')).toEqual(['c9']);
  });

  // The screen shows its retry rather than "start the vault".
  it('reports a failed load as an error, not as an empty vault', async () => {
    get.mockImplementation((path) => (path === '/pets/p1/documents' ? Promise.reject(new Error('Network error')) : answer(path)));
    await mount();

    expect(vault).toEqual({ data: undefined, isError: true });
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('re-reading', () => {
  // As load() did: a co-owner's phone may have changed the vault since.
  it('re-reads every time the screen opens, even when the cache is fresh', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 5 * 60 * 1000 } } });
    await mount();
    await rerender(<DataOnly />);
    await rerender();

    expect(reads()).toEqual([2, 2, 2]);
  });

  // The screen offers its own "Try again": no automatic retries keep the
  // user waiting.
  it('a failed read fails at once, without automatic retries', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0, gcTime: Infinity } } });
    get.mockImplementation((path) => (path === '/pets/p1/documents' ? Promise.reject(new Error('Network error')) : answer(path)));
    await mount();

    expect(vault.isError).toBe(true);
    expect(calls('/pets/p1/documents')).toBe(1);
  });
});

describe('pets that go', () => {
  const cached = () => client.getQueryCache().findAll({ queryKey: ['vault', 'u1', 'p1'] }).length;

  // A pet's medical records must not outlive it (or my access) in memory.
  // The records screen is closed by then: the vault is only cached.
  it('deleting a pet drops its vault', async () => {
    await mount();
    await rerender(<DataOnly />);
    expect(cached()).toBe(1);
    del.mockResolvedValue(null);

    await settle(() => data.deletePet('p1'));

    expect(cached()).toBe(0);
  });

  it('leaving a shared pet drops its vault', async () => {
    await mount();
    await rerender(<DataOnly />);
    expect(cached()).toBe(1);
    post.mockResolvedValue({});

    await settle(() => data.leavePet('p1'));

    expect(cached()).toBe(0);
  });
});

describe('accounts', () => {
  it('drops the cached vaults at logout', async () => {
    await mount();
    const cached = () => client.getQueryCache().findAll({ queryKey: ['vault'] }).filter((q) => q.state.data);
    expect(cached()).toHaveLength(1);

    mockUser = null;
    await rerender();

    expect(cached()).toHaveLength(0);
  });
});

describe('changing the vault', () => {
  // The saved row goes straight into its list, in the server's order, so the
  // list (and the next sheet's clinic chips) has it as the sheet closes.
  it('an added clinic is listed at once, by name, without a re-read', async () => {
    await mount();
    post.mockResolvedValue(clinic('c2', 'ark Vets'));

    let added;
    await settle(async () => { added = await data.addClinic('p1', { name: 'ark Vets' }); });

    expect(added).toEqual(expect.objectContaining({ id: 'c2', name: 'ark Vets' }));
    expect(ids('clinics')).toEqual(['c2', 'c1']);
    expect(reads()).toEqual([1, 1, 1]);
  });

  it('an added visit or upload is listed at once, newest first', async () => {
    await mount();
    post.mockResolvedValue({ ...visit('a2', 'Vaccines'), scheduled_at: '2026-12-01T09:00:00Z' });
    await settle(() => data.addAppointment('p1', { title: 'Vaccines' }));
    expect(ids('appointments')).toEqual(['a2', 'a1']);

    uploadDocument.mockResolvedValue(doc('d3', 'Invoice', { created_at: '2026-10-22T10:00:00Z' }));
    await settle(() => data.addDocument('p1', { uri: 'file://x.jpg', name: 'x.jpg' }, { title: 'Invoice' }));
    expect(ids('documents')).toEqual(['d3', 'd1', 'd2']);
    expect(reads()).toEqual([1, 1, 1]);
  });

  // The server unlinks the visit's documents on delete.
  it('deleting a visit unlinks its documents too', async () => {
    server.p1.documents = [doc('d1', 'Bloodwork', { appointment_id: 'a1' }), doc('d2', 'X-ray')];
    await mount();
    del.mockResolvedValue(null);

    await settle(() => data.deleteAppointment('p1', 'a1'));

    expect(ids('appointments')).toEqual([]);
    expect(vault.data.documents.map((d) => d.appointmentId)).toEqual([null, null]);
    expect(ids('clinics')).toEqual(['c1']);
  });

  // The server unlinks the clinic's visits and documents on delete.
  it('deleting a clinic unlinks its visits and documents too', async () => {
    server.p1.appointments = [{ ...visit('a1', 'Check-up'), clinic_id: 'c1', clinic_name: 'Riverside Vets' }];
    server.p1.documents = [doc('d1', 'Bloodwork', { clinic_id: 'c1' }), doc('d2', 'X-ray')];
    await mount();
    del.mockResolvedValue(null);

    await settle(() => data.deleteClinic('p1', 'c1'));

    expect(ids('clinics')).toEqual([]);
    expect(ids('documents')).toEqual(['d1', 'd2']);
    expect(vault.data.appointments[0]).toEqual(expect.objectContaining({ clinicId: null, clinicName: null }));
    expect(vault.data.documents[0].clinicId).toBeNull();
    expect(reads()).toEqual([1, 1, 1]);
  });

  // Only the row the server confirmed leaves; nothing is re-read.
  it('deleting takes just that row out', async () => {
    await mount();
    del.mockResolvedValue(null);

    let ok;
    await settle(async () => { ok = await data.deleteDocument('p1', 'd1'); });

    expect(ok).toBe(true);
    expect(del).toHaveBeenCalledWith('/pets/p1/documents/d1');
    expect(ids('documents')).toEqual(['d2']);
    expect(reads()).toEqual([1, 1, 1]);

    await settle(() => data.deleteClinic('p1', 'c1'));
    await settle(() => data.deleteAppointment('p1', 'a1'));
    expect([ids('clinics'), ids('appointments')]).toEqual([[], []]);
  });

  it('a failed delete resolves false and keeps the row', async () => {
    await mount();
    del.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.deleteDocument('p1', 'd1'); });

    expect(ok).toBe(false);
    expect(ids('documents')).toEqual(['d1', 'd2']);
  });

  // The AI read may rename or recategorise the document: the list shows it.
  it('an AI read writes the read document into the list', async () => {
    await mount();
    post.mockResolvedValue(doc('d2', 'Rabies certificate', { category: 'vaccination', extraction_status: 'done', extraction: { vaccinations: [] } }));

    let read;
    await settle(async () => { read = await data.extractDocument('p1', 'd2'); });

    expect(read).toEqual(expect.objectContaining({ id: 'd2', extractionStatus: 'done' }));
    expect(vault.data.documents[1]).toEqual(expect.objectContaining({ title: 'Rabies certificate', category: 'vaccination', extractionStatus: 'done' }));
    expect(reads()).toEqual([1, 1, 1]);
  });

  it('applying a reading re-reads the vault and the pets', async () => {
    await mount();
    const petsBefore = calls('/pets');
    post.mockResolvedValue({ vaccinations: [{ id: 'v1' }] });

    await settle(() => data.applyExtraction('p1', 'd2', { vaccinations: [] }));

    expect(reads()).toEqual([2, 2, 2]);
    expect(calls('/pets')).toBe(petsBefore + 1);
  });
});
