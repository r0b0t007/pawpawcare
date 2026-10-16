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
jest.mock('../../../context/DataContext', () => ({
  useData: () => mockStore,
}));

import React from 'react';
import { Text } from 'react-native';
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
  mockStore = {
    pets: [BISCUIT],
    reminders: [],
    notifications: [],
    unreadCount: 0,
    lastSyncedAt: null,
    addVaccination: noop,
    markVaccinationComplete: noop,
    deleteVaccination: noop,
    addReminder: noop,
    updateReminder: noop,
    deleteReminder: noop,
    refreshNotifications: noop,
    markNotificationRead: noop,
    snoozeNotification: noop,
    dismissNotification: noop,
    getPetRecords: () => Promise.resolve({ clinics: [], appointments: [], documents: [] }),
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

test('Medical records', async () => {
  const shown = await render(
    <MedicalRecordsScreen navigation={navigation} route={{ params: { petId: 'p1', petName: 'Biscuit' } }} />,
  );
  expect(shown).toContain("Start Biscuit's vault");
  await inFrench(async () => {
    expect(texts(tree)).toContain('Créez le coffre de Biscuit');
  });
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
