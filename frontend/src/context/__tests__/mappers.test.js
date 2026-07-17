// DataContext transitively imports native modules (via AuthContext and the
// notifications service) — mock them like AuthContext.test.js does; the
// mappers under test are pure functions.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  request: jest.fn(),
  getTokens: jest.fn(() => Promise.resolve({ access: null, refresh: null })),
  storeTokens: jest.fn(() => Promise.resolve()),
  clearTokens: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(() => Promise.resolve(null)),
  deviceTimezone: jest.fn(() => 'UTC'),
  cancelAllLocalReminders: jest.fn(() => Promise.resolve()),
  scheduleLocalReminders: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/analytics', () => ({
  identifyUser: jest.fn(),
  resetAnalytics: jest.fn(),
  track: jest.fn(),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { signOut: jest.fn(() => Promise.resolve()) },
}));

import { toPet } from '../DataContext';

// Regression tests for the vaccination mapper (via the exported toPet).
// dueDate MUST stay ISO (YYYY-MM-DD): every consumer either parses it as
// `${dueDate}T12:00:00` (invalid on Hermes for locale strings — records
// silently vanished from the Health hub until re-login) or sorts it with
// localeCompare (wrong order for "Jul"/"Aug" display strings).

// Local-date ISO (not toISOString, which is UTC and drifts a day off local
// near midnight) — the mapper's day math is local, so the fixtures must be.
const isoDaysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const petWithVax = (vax) =>
  toPet({ id: 'p1', name: 'Rex' }, { vaccinations: [vax] });

describe('toVax (via toPet)', () => {
  it('keeps dueDate in ISO format so date math and sorting work', () => {
    const due = isoDaysFromNow(10);
    const [v] = petWithVax({ id: 'v1', name: 'Rabies', due_date: due, status: 'upcoming' }).vaccinations;

    expect(v.dueDate).toBe(due);
    // The Health hub / Dashboard parse exactly this way — must be valid.
    expect(Number.isNaN(new Date(`${v.dueDate}T12:00:00`).getTime())).toBe(false);
  });

  it('keeps a record due TODAY as due_soon, not overdue', () => {
    // The server only flips to overdue when due_date is strictly before
    // today — a record due today must stay in the upcoming schedule all day,
    // regardless of the time of day the mapper runs.
    const [v] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: isoDaysFromNow(0), status: 'upcoming',
    }).vaccinations;
    expect(v.status).toBe('due_soon');
  });

  it('treats the 30-day boundary as due_soon regardless of time of day', () => {
    const [v] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: isoDaysFromNow(30), status: 'upcoming',
    }).vaccinations;
    expect(v.status).toBe('due_soon');
  });

  it('flags upcoming records within 30 days as due_soon', () => {
    const [v] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: isoDaysFromNow(10), status: 'upcoming',
    }).vaccinations;
    expect(v.status).toBe('due_soon');
  });

  it('keeps far-future records as upcoming', () => {
    const [v] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: isoDaysFromNow(90), status: 'upcoming',
    }).vaccinations;
    expect(v.status).toBe('upcoming');
  });

  it('flips past-due upcoming records to overdue locally (mirrors the server)', () => {
    // The create endpoint returns status "upcoming" even for past dates; the
    // server only flips to overdue on the next list. Without the local flip a
    // freshly added past-dated record lands in no visible bucket.
    const [v] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: isoDaysFromNow(-3), status: 'upcoming',
    }).vaccinations;
    expect(v.status).toBe('overdue');
  });

  it('preserves completed status and administered date', () => {
    const [v] = petWithVax({
      id: 'v1',
      name: 'Rabies',
      due_date: '2026-01-10',
      status: 'completed',
      administered_date: '2026-01-09',
    }).vaccinations;
    expect(v.status).toBe('completed');
    expect(v.administeredDate).toBe('2026-01-09');
  });

  it('survives the updatePet round-trip without corrupting dates', () => {
    // updatePet re-maps frontend-shaped vaccinations through toPet by
    // restoring the API keys — the round-trip must be lossless.
    const due = isoDaysFromNow(10);
    const [first] = petWithVax({
      id: 'v1', name: 'Rabies', due_date: due, status: 'completed', administered_date: due,
    }).vaccinations;

    const [roundTripped] = petWithVax({
      ...first,
      due_date: first.dueDate,
      administered_date: first.administeredDate,
    }).vaccinations;

    expect(roundTripped.dueDate).toBe(due);
    expect(roundTripped.administeredDate).toBe(due);
    expect(roundTripped.status).toBe('completed');
  });
});
