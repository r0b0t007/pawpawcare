// The home area (CHW-191) reads its strings from src/i18n: English stays
// exactly as before, and switching the app to French re-renders each screen
// in French. User data (pet names, record titles) is interpolated, never
// translated.

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../../hooks/useToday', () => ({ useToday: () => new Date('2026-10-15T10:00:00') }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../services/imagePicker', () => ({ pickRecordImage: jest.fn() }));

let mockStore = {};
// The reminder screens show the CHW-230 notifications banner, which reads the
// signed-in user; allowed here, so it stays hidden.
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, registerPushDevice: jest.fn() }) }));
jest.mock('../../../services/notifications', () => ({
  ...jest.requireActual('../../../services/notifications'),
  getNotificationPermission: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
}));
const mockWithoutPets = ({ pets, ...rest }) => rest;
jest.mock('../../../hooks/usePetRecords', () => ({ usePetRecords: () => mockStore.pets }));
jest.mock('../../../context/DataContext', () => ({
  useData: () => mockWithoutPets(mockStore),
}));

import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import i18n from '../../../i18n';
import HealthHubScreen from '../HealthHubScreen';
import VaccinationTrackerScreen from '../VaccinationTrackerScreen';
import RemindersScreen from '../RemindersScreen';
import NotificationsScreen from '../NotificationsScreen';
import MedicalRecordsScreen from '../MedicalRecordsScreen';
import { milestoneLabel } from '../../../hooks/useGamification';
import { petHealthStatus } from '../../../components/petStatus';
import { medicationStreakLabel } from '../../../utils/streaks';

jest.mock('../../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: jest.fn() }));
// The delete confirmation opens a dialog, which needs a gesture root.
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
const mockNotificationsQuery = jest.fn();
jest.mock('../../../hooks/useNotifications', () => ({
  useNotificationsQuery: () => mockNotificationsQuery(),
  useUnreadCount: () => ({ data: 0, isStale: false, refetch: jest.fn() }),
}));
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
const mockVaultQuery = jest.fn();
jest.mock('../../../hooks/useVault', () => ({ useVaultQuery: () => mockVaultQuery() }));
const EMPTY_VAULT = { clinics: [], appointments: [], documents: [] };
const noop = () => Promise.resolve(true);
const BISCUIT = {
  id: 'p1', name: 'Biscuit', type: 'dog', colorIndex: 0,
  vaccinations: [{ id: 'v1', name: 'Rabies', status: 'overdue', dueDate: '2026-10-01' }],
  medications: [],
};
const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const texts = (tree) => tree.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

let tree;
async function render(element) {
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  return texts(tree);
}

async function inFrench(fn) {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  try {
    await fn();
  } finally {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  }
}

beforeEach(() => {
  mockVaultQuery.mockReturnValue({ data: EMPTY_VAULT, isError: false, isFetching: false, refetch: jest.fn() });
  mockNotificationsQuery.mockReturnValue({
    data: { notifications: [], unreadCount: 0 }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn(),
  });
  mockStore = {
    pets: [BISCUIT],
    reminders: [],
    lastSyncedAt: null,
    addVaccination: noop,
    markVaccinationComplete: noop,
    deleteVaccination: noop,
    addReminder: noop,
    updateReminder: noop,
    deleteReminder: noop,
    markNotificationRead: noop,
    snoozeNotification: noop,
    dismissNotification: noop,
    addClinic: noop, deleteClinic: noop, addAppointment: noop, deleteAppointment: noop,
    addDocument: noop, deleteDocument: noop, getDocumentUrl: noop, extractDocument: noop, applyExtraction: noop,
  };
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

test('Health', async () => {
  const shown = await render(<HealthHubScreen navigation={navigation} />);
  expect(shown).toContain('Health');
  expect(shown).toContain('Biscuit · was due Thu 1 Oct');
  await inFrench(async () => {
    expect(texts(tree)).toContain('Santé');
    expect(texts(tree)).toContain('Coffre médical de Biscuit');
  });
});

test('Vaccines', async () => {
  const shown = await render(<VaccinationTrackerScreen navigation={navigation} route={{ params: { petId: 'p1' } }} />);
  expect(shown).toContain('Rabies needs booking');
  expect(shown).toContain('Was due Oct 1, 2026');
  await inFrench(async () => {
    expect(texts(tree)).toContain('Rendez-vous à prendre : Rabies');
  });
});

test('Reminders', async () => {
  mockStore.reminders = [
    { id: 'r1', title: 'Flea drops', enabled: true, schedule_type: 'recurring', recurrence: 'weekly', time_of_day: '09:00', pet_id: 'p1' },
  ];
  const shown = await render(<RemindersScreen navigation={navigation} />);
  expect(shown).toContain('Biscuit · Weekly at 9:00 AM');
  await inFrench(async () => {
    // The server's title is shown as-is; only the app's words change.
    expect(texts(tree)).toContain('Flea drops');
    expect(texts(tree)).toContain('Biscuit · Toutes les semaines à 9:00');
  });
});

test('Notifications', async () => {
  const shown = await render(<NotificationsScreen navigation={navigation} />);
  expect(shown).toContain("You're all caught up");
  await inFrench(async () => {
    expect(texts(tree)).toContain('Vous êtes à jour');
  });
});

// The list loads on its own now: never "all caught up" before it has.
test('Notifications show they are loading, then a retry if the load failed', async () => {
  mockNotificationsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, isFetching: true, refetch: jest.fn() });
  let shown = await render(<NotificationsScreen navigation={navigation} />);
  const spinner = () => tree.root.findAllByType(ActivityIndicator).some((n) => n.props.accessibilityLabel === 'Loading…');
  expect(spinner()).toBe(true);
  expect(shown).not.toContain("You're all caught up");

  const refetch = jest.fn();
  mockNotificationsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false, refetch });
  await act(async () => tree.update(<NotificationsScreen navigation={navigation} />));
  shown = texts(tree);
  expect(shown).toContain("Couldn't load your notifications.");
  expect(shown).not.toContain("You're all caught up");
  const retry = tree.root.findAll((n) => n.props.label === 'Retry' && typeof n.props.onPress === 'function')[0];
  await act(async () => retry.props.onPress());
  expect(refetch).toHaveBeenCalled();

  // Retrying: loading again, not the same error.
  mockNotificationsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: true, refetch });
  await act(async () => tree.update(<NotificationsScreen navigation={navigation} />));
  expect(spinner()).toBe(true);
  expect(texts(tree)).not.toContain("Couldn't load your notifications.");
});

// A background re-read that fails keeps the list it has, even an empty one.
test('Notifications keep a loaded empty list when a re-read fails', async () => {
  mockNotificationsQuery.mockReturnValue({
    data: { notifications: [], unreadCount: 0 }, isLoading: false, isError: true, isFetching: false, refetch: jest.fn(),
  });
  const shown = await render(<NotificationsScreen navigation={navigation} />);
  expect(shown).toContain("You're all caught up");
  expect(shown).not.toContain("Couldn't load your notifications.");
});

test('Medical records', async () => {
  const shown = await render(
    <MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />,
  );
  expect(shown).toContain("Start Biscuit's vault");
  await inFrench(async () => {
    expect(texts(tree)).toContain('Créez le coffre de Biscuit');
  });
});

// The vault loads when the screen opens: placeholders first, a retry if the
// first load failed (placeholders again while it runs), and a failed re-read
// keeps what is shown.
test('Medical records show loading, a retry, then the records', async () => {
  const records = () => <MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />;
  const placeholders = () => tree.root.findAll((n) => n.props.accessibilityLabel === 'Loading records' && n.props.children).length > 0;

  mockVaultQuery.mockReturnValue({ data: undefined, isError: false, isFetching: true, refetch: jest.fn() });
  await render(records());
  expect(placeholders()).toBe(true);

  const refetch = jest.fn(() => Promise.resolve({ isError: false }));
  mockVaultQuery.mockReturnValue({ data: undefined, isError: true, isFetching: false, refetch });
  await act(async () => tree.update(records()));
  expect(texts(tree)).toContain("We couldn't open the vault");
  const retry = tree.root.findAll((n) => n.props.label === 'Try again' && typeof n.props.onPress === 'function')[0];
  await act(async () => retry.props.onPress());
  expect(refetch).toHaveBeenCalled();

  mockVaultQuery.mockReturnValue({ data: undefined, isError: true, isFetching: true, refetch });
  await act(async () => tree.update(records()));
  expect(placeholders()).toBe(true);
  expect(texts(tree)).not.toContain("We couldn't open the vault");

  mockVaultQuery.mockReturnValue({
    data: { ...EMPTY_VAULT, documents: [{ id: 'd1', petId: 'p1', title: 'Bloodwork', category: 'lab', extractionStatus: 'none' }] },
    isError: true, isFetching: false, refetch,
  });
  await act(async () => tree.update(records()));
  expect(texts(tree)).toContain('Bloodwork');
  expect(texts(tree)).not.toContain("We couldn't open the vault");
});

// Opening re-reads the vault: if that fails over records from the cache, the
// screen says so rather than passing them off as current.
test('Medical records say when a re-read fails over cached records', async () => {
  const { showToast } = require('../../../components/Toast');
  showToast.mockClear();
  const shown = { ...EMPTY_VAULT, documents: [{ id: 'd1', petId: 'p1', title: 'Bloodwork', category: 'lab', extractionStatus: 'none' }] };
  const records = () => <MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />;
  mockVaultQuery.mockReturnValue({ data: shown, isError: false, isFetching: true, errorUpdatedAt: 0, refetch: jest.fn() });
  await render(records());
  expect(showToast).not.toHaveBeenCalled();

  mockVaultQuery.mockReturnValue({ data: shown, isError: true, isFetching: false, errorUpdatedAt: 1000, refetch: jest.fn() });
  await act(async () => tree.update(records()));
  expect(showToast).toHaveBeenCalledWith("Couldn't refresh the vault. Showing what was already here.");
  expect(texts(tree)).toContain('Bloodwork');
});

// The screen can stay mounted under a tab: a focus re-read only once stale.
test('Medical records re-read on focus only once the vault is stale', async () => {
  const { useRefetchOnFocus } = require('../../../hooks/useRefetchOnFocus');
  const refetch = jest.fn();
  mockVaultQuery.mockReturnValue({ data: EMPTY_VAULT, isError: false, isFetching: false, isStale: false, refetch });
  await render(<MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />);

  expect(useRefetchOnFocus).toHaveBeenCalledWith(refetch, { isStale: false });
});

// DataContext takes the row out of the vault; the screen only confirms.
test('Medical records delete through DataContext and say so', async () => {
  const deleteDocument = jest.fn(() => Promise.resolve(true));
  mockStore.deleteDocument = deleteDocument;
  mockVaultQuery.mockReturnValue({
    data: { ...EMPTY_VAULT, documents: [{ id: 'd1', petId: 'p1', title: 'Bloodwork', category: 'lab', extractionStatus: 'none' }] },
    isError: false, isFetching: false, refetch: jest.fn(),
  });
  await render(<MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />);

  const remove = tree.root.findAll((n) => n.props.accessibilityLabel === 'Delete Bloodwork' && typeof n.props.onPress === 'function')[0];
  await act(async () => remove.props.onPress());
  const dialog = tree.root.findAll((n) => typeof n.props.onConfirm === 'function' && n.props.visible)[0];
  await act(async () => dialog.props.onConfirm());

  expect(deleteDocument).toHaveBeenCalledWith('p1', 'd1');
});

test('shared labels: status, milestones, streaks', async () => {
  expect(petHealthStatus(BISCUIT.vaccinations).label).toBe('Vaccine overdue');
  expect(milestoneLabel('anniversary_2')).toBe('2 years together');
  expect(medicationStreakLabel({ current: 3, longest: 3, coveredToday: true })).toBe('3-day streak');
  await inFrench(async () => {
    expect(petHealthStatus(BISCUIT.vaccinations).label).toBe('Vaccin en retard');
    expect(milestoneLabel('anniversary_2')).toBe('2 ans ensemble');
    expect(medicationStreakLabel({ current: 3, longest: 3, coveredToday: true })).toBe('Série de 3 jours');
  });
});
