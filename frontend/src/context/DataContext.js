import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { PET_COLORS } from '../theme';
import { get, post, patch, put, del, uploadDocument } from '../services/api';
import { scheduleLocalReminders } from '../services/notifications';
import { track } from '../services/analytics';
import { petsKeys } from '../hooks/queryKeys';

const DataContext = createContext(null);

// ── Date helpers ──────────────────────────────────────────────────────────────

const formatDisplayDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const parseToISO = (str) => {
  if (!str?.trim()) return null;
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 30);
  return fallback.toISOString().split('T')[0];
};

// ── API → frontend shape mappers ──────────────────────────────────────────────

const toVax = (v) => {
  let status = v.status;
  if (status === 'upcoming') {
    const daysUntil = (new Date(v.due_date) - new Date()) / 86400000;
    if (daysUntil <= 30) status = 'due_soon';
  }
  return {
    id: v.id,
    name: v.name,
    dueDate: formatDisplayDate(v.due_date),
    status,
    administeredDate: v.administered_date || null,
    notes: v.notes || null,
  };
};

const toAct = (a) => ({
  id: a.id,
  name: a.name,
  duration: a.duration ? parseInt(a.duration) || 30 : 30,
  timeOfDay: a.time_of_day || 'morning',
  icon: a.icon || 'run',
});

const toFood = (f) => ({ id: f.id, name: f.name });

const toWeight = (w) => ({
  id: w.id,
  weight: w.weight,
  unit: w.unit || 'kg',
  loggedAt: w.logged_at,
  notes: w.notes || null,
});

const toExpense = (e) => ({
  id: e.id,
  category: e.category || 'other',
  amount: e.amount,
  incurredOn: e.incurred_on,
  notes: e.notes || null,
});

const toMed = (m) => ({
  id: m.id,
  name: m.name,
  dosage: m.dosage || null,
  frequency: m.frequency || 'daily',
  times: Array.isArray(m.times) ? m.times : [],
  startDate: m.start_date || null,
  endDate: m.end_date || null,
  notes: m.notes || null,
  active: m.active !== false,
  lastAdministeredAt: m.last_administered_at || null,
});

export const toPet = (apiPet, opts = {}) => {
  const {
    vaccinations = [], activities = [], foods = [], medications = [], weights = [], expenses = [], index = 0,
  } = opts;
  return {
  id: apiPet.id,
  ownerId: apiPet.owner_id,
  name: apiPet.name,
  type: apiPet.type,
  breed: apiPet.breed,
  age: apiPet.age,
  birthday: apiPet.birthday,
  weight: apiPet.weight?.toString() ?? null,
  weightUnit: apiPet.weight_unit || 'kg',
  gender: apiPet.gender,
  microchipped: apiPet.microchipped,
  color: apiPet.color || PET_COLORS[index % PET_COLORS.length],
  avatarUrl: apiPet.avatar_url || null,
  vaccinations: vaccinations.map(toVax),
  activities: activities.map(toAct),
  favoriteFoods: foods.map(toFood),
  medications: medications.map(toMed),
  weights: weights.map(toWeight),
  expenses: expenses.map(toExpense),
  healthStats: {
    heartRate: apiPet.heart_rate || 0,
    weightStatus: apiPet.weight ? 'Ideal' : 'Unknown',
    activityLevel: apiPet.activity_level || 'Low',
    lastCheckup: 'Unknown',
    nextVax: 'Not set',
  },
  createdAt: apiPet.created_at,
  };
};

const toPost = (p) => ({
  id: p.id,
  authorId: p.author_id,
  authorName: p.author_name || 'Unknown',
  content: p.content,
  paws: p.paw_count,
  pawedBy: p.pawed_by_me ? ['me'] : [],
  pawedByMe: p.pawed_by_me,
  comments: p.comment_count ?? 0,
  imageUrl: p.image_url || null,
  createdAt: p.created_at,
});

const toGroup = (g) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  location: g.location || 'Global',
  icon: g.icon,
  members: g.member_count,
  isJoined: g.is_member,
});

const toLostPet = (r) => ({
  id: r.id,
  petId: r.pet_id,
  petName: r.pet_name || 'A pet',
  petType: r.pet_type,
  petColor: r.pet_color,
  status: r.status,
  reporterName: r.reporter_name,
  reportedBy: r.reported_by,
  lastSeenLocation: r.last_seen_location,
  lastSeenAt: r.last_seen_at,
  description: r.description,
  contactPhone: r.contact_phone,
  photoUrl: r.photo_url,
  createdAt: r.created_at,
});

// An invitation addressed to me (someone shared their pet with my email).
const toInvite = (i) => ({
  id: i.id,
  petId: i.pet_id,
  petName: i.pet?.name || 'a pet',
  petType: i.pet?.type || null,
  petColor: i.pet?.color || null,
  email: i.email,
  inviterName: i.inviter?.name || 'Someone',
  inviterEmail: i.inviter?.email || null,
  createdAt: i.created_at,
});

// Medical records vault — lazy-loaded per pet, not kept in global pet state.
const toClinic = (c) => ({
  id: c.id,
  petId: c.pet_id,
  name: c.name,
  vetName: c.vet_name || null,
  phone: c.phone || null,
  email: c.email || null,
  address: c.address || null,
  notes: c.notes || null,
});

const toAppointment = (a) => ({
  id: a.id,
  petId: a.pet_id,
  clinicId: a.clinic_id || null,
  clinicName: a.clinic_name || null,
  title: a.title,
  scheduledAt: a.scheduled_at,
  status: a.status,
  notes: a.notes || null,
});

const toDocument = (d) => ({
  id: d.id,
  petId: d.pet_id,
  appointmentId: d.appointment_id || null,
  clinicId: d.clinic_id || null,
  title: d.title,
  category: d.category || 'other',
  mime: d.mime || null,
  sizeBytes: d.size_bytes || null,
  createdAt: d.created_at,
  // AI intake — `extraction` keeps the raw snake_case suggestion payload as
  // stored server-side (the review sheet builds the apply request from it).
  extractionStatus: d.extraction_status || 'none',
  extraction: d.extraction || null,
  extractedAt: d.extracted_at || null,
});

// ── Reducer ───────────────────────────────────────────────────────────────────

function dataReducer(state, action) {
  switch (action.type) {
    case 'SET_DATA_LOADED': return { ...state, dataLoaded: action.payload };
    case 'SET_PETS':   return { ...state, pets: action.payload };
    case 'ADD_PET':    return { ...state, pets: [...state.pets, action.payload] };
    case 'UPDATE_PET': return { ...state, pets: state.pets.map((p) => (p.id === action.payload.id ? action.payload : p)) };
    case 'DELETE_PET': return { ...state, pets: state.pets.filter((p) => p.id !== action.payload) };
    case 'SET_POSTS':  return { ...state, posts: action.payload };
    case 'ADD_POST':   return { ...state, posts: [action.payload, ...state.posts] };
    case 'UPDATE_POST':return { ...state, posts: state.posts.map((p) => (p.id === action.payload.id ? action.payload : p)) };
    case 'SET_GROUPS':   return { ...state, groups: action.payload };
    case 'UPDATE_GROUP': return { ...state, groups: state.groups.map((g) => (g.id === action.payload.id ? action.payload : g)) };
    case 'SET_REMINDERS':     return { ...state, reminders: action.payload };
    case 'SET_NOTIFICATIONS': return { ...state, notifications: action.payload.notifications || [], unreadCount: action.payload.unread_count || 0 };
    case 'SET_LOST_PETS':     return { ...state, lostPets: action.payload };
    case 'SET_MY_REPORTS':    return { ...state, myReports: action.payload };
    case 'SET_INVITES':       return { ...state, invites: action.payload };
    default:           return state;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(dataReducer, {
    pets: [], posts: [], groups: [], reminders: [], notifications: [], unreadCount: 0,
    lostPets: [], myReports: [], invites: [], dataLoaded: false,
  });
  const { user, logout } = useAuth();
  // Bridge to React Query while domains migrate off this store: mutations here
  // invalidate the matching query so migrated screens refetch (see queryKeys.js).
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      queryClient.removeQueries({ queryKey: petsKeys.all });
      dispatch({ type: 'SET_DATA_LOADED', payload: false });
      dispatch({ type: 'SET_PETS', payload: [] });
      dispatch({ type: 'SET_POSTS', payload: [] });
      dispatch({ type: 'SET_REMINDERS', payload: [] });
      dispatch({ type: 'SET_NOTIFICATIONS', payload: { notifications: [], unread_count: 0 } });
      dispatch({ type: 'SET_LOST_PETS', payload: [] });
      dispatch({ type: 'SET_MY_REPORTS', payload: [] });
      dispatch({ type: 'SET_INVITES', payload: [] });
    }
  }, [user?.id]);

  const handleApiError = (err) => {
    if (err.message === 'SESSION_EXPIRED') logout();
  };

  const loadData = async () => {
    try {
      const [apiPets, apiPosts, apiGroups, apiReminders, apiNotifications, apiMyReports, apiInvites] = await Promise.all([
        get('/pets'),
        get('/community/posts'),
        get('/community/groups'),
        get('/reminders'),
        get('/notifications'),
        get('/lost-pets/mine'),
        get('/invites'),
      ]);

      // Load each pet's sub-resources in parallel
      const petsWithData = await Promise.all(
        apiPets.map(async (apiPet, i) => {
          const [vax, acts, foods, meds, weights, expenses] = await Promise.all([
            get(`/pets/${apiPet.id}/vaccinations`),
            get(`/pets/${apiPet.id}/activities`),
            get(`/pets/${apiPet.id}/foods`),
            get(`/pets/${apiPet.id}/medications`),
            get(`/pets/${apiPet.id}/weights`),
            get(`/pets/${apiPet.id}/expenses`),
          ]);
          return toPet(apiPet, { vaccinations: vax, activities: acts, foods, medications: meds, weights, expenses, index: i });
        })
      );

      dispatch({ type: 'SET_PETS',   payload: petsWithData });
      dispatch({ type: 'SET_POSTS',  payload: apiPosts.map(toPost) });
      dispatch({ type: 'SET_GROUPS', payload: apiGroups.map(toGroup) });
      dispatch({ type: 'SET_REMINDERS', payload: apiReminders });
      dispatch({ type: 'SET_NOTIFICATIONS', payload: apiNotifications });
      dispatch({ type: 'SET_MY_REPORTS', payload: apiMyReports.map(toLostPet) });
      dispatch({ type: 'SET_INVITES', payload: apiInvites.map(toInvite) });

      // Mirror server reminders onto on-device local notifications (primary delivery).
      scheduleLocalReminders(apiReminders);
    } catch (err) {
      handleApiError(err);
    } finally {
      // Initial fan-out finished (even on error) — screens can report TTI.
      dispatch({ type: 'SET_DATA_LOADED', payload: true });
    }
  };

  // ── Reminders & notifications ──

  const refreshReminders = async () => {
    try {
      const reminders = await get('/reminders');
      dispatch({ type: 'SET_REMINDERS', payload: reminders });
      scheduleLocalReminders(reminders);
    } catch (err) { handleApiError(err); }
  };

  const refreshNotifications = async () => {
    try {
      const data = await get('/notifications');
      dispatch({ type: 'SET_NOTIFICATIONS', payload: data });
    } catch (err) { handleApiError(err); }
  };

  const addReminder = async (payload) => {
    try {
      await post('/reminders', payload);
      await refreshReminders();
    } catch (err) { handleApiError(err); }
  };

  const updateReminder = async (id, updates) => {
    try {
      await patch(`/reminders/${id}`, updates);
      await refreshReminders();
    } catch (err) { handleApiError(err); }
  };

  const deleteReminder = async (id) => {
    try {
      await del(`/reminders/${id}`);
      await refreshReminders();
    } catch (err) { handleApiError(err); }
  };

  const markNotificationRead = async (id) => {
    try {
      await post(`/notifications/${id}/read`);
      await refreshNotifications();
    } catch (err) { handleApiError(err); }
  };

  const snoozeNotification = async (id, minutes = 60) => {
    try {
      await post(`/notifications/${id}/snooze`, { minutes });
      await Promise.all([refreshNotifications(), refreshReminders()]);
    } catch (err) { handleApiError(err); }
  };

  const dismissNotification = async (id) => {
    try {
      await post(`/notifications/${id}/dismiss`);
      await refreshNotifications();
    } catch (err) { handleApiError(err); }
  };

  // ── Pet CRUD ──

  const addPet = async (petData) => {
    try {
      const apiPet = await post('/pets', {
        name: petData.name,
        type: petData.type || 'dog',
        breed: petData.breed || null,
        age: petData.age ? parseFloat(petData.age) : null,
        birthday: petData.birthday || null,
        weight: petData.weight ? parseFloat(petData.weight) : null,
        weight_unit: petData.weightUnit || 'kg',
        gender: petData.gender || null,
        microchipped: petData.microchipped || false,
        color: PET_COLORS[state.pets.length % PET_COLORS.length],
        avatar_url: petData.avatarUrl || null,
      });
      const newPet = toPet(apiPet, { index: state.pets.length });
      dispatch({ type: 'ADD_PET', payload: newPet });
      queryClient.invalidateQueries({ queryKey: petsKeys.all });
      track('pet_added', { type: newPet.type, pet_count: state.pets.length + 1 });
      // Creating a pet with a weight seeds a server-side log — reflect it.
      if (petData.weight) refreshPetWeights(newPet.id);
      return newPet;
    } catch (err) {
      handleApiError(err);
    }
  };

  const updatePet = async (petId, updates) => {
    try {
      const apiUpdate = {};
      if (updates.name !== undefined)        apiUpdate.name = updates.name;
      if (updates.type !== undefined)        apiUpdate.type = updates.type;
      if (updates.breed !== undefined)       apiUpdate.breed = updates.breed;
      if (updates.age !== undefined)         apiUpdate.age = updates.age ? parseFloat(updates.age) : null;
      if (updates.birthday !== undefined)    apiUpdate.birthday = updates.birthday || null;
      if (updates.weight !== undefined)      apiUpdate.weight = updates.weight ? parseFloat(updates.weight) : null;
      if (updates.weightUnit !== undefined)  apiUpdate.weight_unit = updates.weightUnit;
      if (updates.gender !== undefined)      apiUpdate.gender = updates.gender;
      if (updates.microchipped !== undefined) apiUpdate.microchipped = updates.microchipped;
      if (updates.color !== undefined)       apiUpdate.color = updates.color;
      if (updates.avatarUrl !== undefined)   apiUpdate.avatar_url = updates.avatarUrl || null;

      if (Object.keys(apiUpdate).length > 0) {
        const updated = await patch(`/pets/${petId}`, apiUpdate);
        const existing = state.pets.find((p) => p.id === petId);
        const merged = {
          ...existing,
          ...toPet(updated, {
            vaccinations: existing.vaccinations.map((v) => ({ ...v, due_date: v.dueDate })),
            activities: existing.activities,
            foods: existing.favoriteFoods,
          }),
        };
        // Preserve sub-resources that toPet would otherwise re-map from frontend shape.
        merged.medications = existing.medications || [];
        merged.weights = existing.weights || [];
        dispatch({ type: 'UPDATE_PET', payload: merged });
        queryClient.invalidateQueries({ queryKey: petsKeys.all });
        // A weight edit creates a server-side log; refetch so the tracker stays in sync.
        if (updates.weight !== undefined) refreshPetWeights(petId);
      }
    } catch (err) {
      handleApiError(err);
    }
  };

  const deletePet = async (petId) => {
    try {
      await del(`/pets/${petId}`);
      dispatch({ type: 'DELETE_PET', payload: petId });
      queryClient.invalidateQueries({ queryKey: petsKeys.all });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Vaccination ──

  const addVaccination = async (petId, vaccination) => {
    try {
      const apiVax = await post(`/pets/${petId}/vaccinations`, {
        name: vaccination.name,
        due_date: parseToISO(vaccination.dueDate),
        notes: vaccination.notes || null,
      });
      const newVax = toVax(apiVax);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, vaccinations: [...pet.vaccinations, newVax] } });
      return newVax;
    } catch (err) {
      handleApiError(err);
    }
  };

  const markVaccinationComplete = async (petId, vaccinationId) => {
    try {
      const apiVax = await patch(`/pets/${petId}/vaccinations/${vaccinationId}/complete`, {});
      const updated = toVax(apiVax);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, vaccinations: pet.vaccinations.map((v) => (v.id === vaccinationId ? updated : v)) } });
    } catch (err) {
      handleApiError(err);
    }
  };

  const deleteVaccination = async (petId, vaccinationId) => {
    try {
      await del(`/pets/${petId}/vaccinations/${vaccinationId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, vaccinations: pet.vaccinations.filter((v) => v.id !== vaccinationId) } });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Favorite Foods ──

  const addFavoriteFood = async (petId, foodName) => {
    try {
      const apiFood = await post(`/pets/${petId}/foods`, { name: foodName });
      const newFood = toFood(apiFood);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, favoriteFoods: [...pet.favoriteFoods, newFood] } });
    } catch (err) {
      handleApiError(err);
    }
  };

  const removeFavoriteFood = async (petId, foodId) => {
    try {
      await del(`/pets/${petId}/foods/${foodId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, favoriteFoods: pet.favoriteFoods.filter((f) => f.id !== foodId) } });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Activities ──

  const addActivity = async (petId, activity) => {
    try {
      const apiAct = await post(`/pets/${petId}/activities`, {
        name: activity.name,
        duration: activity.duration?.toString(),
        time_of_day: activity.timeOfDay,
        icon: activity.icon,
      });
      const newAct = toAct(apiAct);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, activities: [...pet.activities, newAct] } });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Weight history ──

  const refreshPetWeights = async (petId) => {
    try {
      const apiWeights = await get(`/pets/${petId}/weights`);
      const weights = apiWeights.map(toWeight);
      const latest = weights.length ? weights[weights.length - 1] : null;
      const pet = state.pets.find((p) => p.id === petId);
      if (pet) {
        dispatch({
          type: 'UPDATE_PET',
          payload: {
            ...pet,
            weights,
            ...(latest ? { weight: String(latest.weight), weightUnit: latest.unit } : {}),
          },
        });
      }
    } catch (err) {
      handleApiError(err);
    }
  };

  const addWeight = async (petId, entry) => {
    try {
      const apiW = await post(`/pets/${petId}/weights`, {
        weight: parseFloat(entry.weight),
        logged_at: entry.loggedAt || undefined,
      });
      const newW = toWeight(apiW);
      const pet = state.pets.find((p) => p.id === petId);
      const weights = [...(pet.weights || []), newW].sort((a, b) => (a.loggedAt || '').localeCompare(b.loggedAt || ''));
      const latest = weights[weights.length - 1];
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, weights, weight: String(latest.weight), weightUnit: latest.unit } });
      return newW;
    } catch (err) {
      handleApiError(err);
    }
  };

  const deleteWeight = async (petId, weightId) => {
    try {
      await del(`/pets/${petId}/weights/${weightId}`);
      const pet = state.pets.find((p) => p.id === petId);
      const weights = (pet.weights || []).filter((w) => w.id !== weightId);
      const latest = weights.length ? weights[weights.length - 1] : null;
      dispatch({
        type: 'UPDATE_PET',
        payload: {
          ...pet,
          weights,
          weight: latest ? String(latest.weight) : pet.weight,
          weightUnit: latest ? latest.unit : pet.weightUnit,
        },
      });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Expenses ──

  const addExpense = async (petId, entry) => {
    try {
      const apiE = await post(`/pets/${petId}/expenses`, {
        category: entry.category || 'other',
        amount: parseFloat(entry.amount),
        incurred_on: entry.incurredOn || undefined,
        notes: entry.notes || undefined,
      });
      const newE = toExpense(apiE);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, expenses: [newE, ...(pet.expenses || [])] } });
      return newE;
    } catch (err) {
      handleApiError(err);
    }
  };

  const deleteExpense = async (petId, expenseId) => {
    try {
      await del(`/pets/${petId}/expenses/${expenseId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, expenses: (pet.expenses || []).filter((e) => e.id !== expenseId) } });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Medications ──

  const addMedication = async (petId, med) => {
    try {
      const apiMed = await post(`/pets/${petId}/medications`, {
        name: med.name,
        dosage: med.dosage || null,
        frequency: med.frequency || 'daily',
        times: med.times && med.times.length ? med.times : ['09:00'],
        notes: med.notes || null,
      });
      const newMed = toMed(apiMed);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, medications: [...(pet.medications || []), newMed] } });
      refreshReminders(); // a medication schedules dose reminders
      return newMed;
    } catch (err) {
      handleApiError(err);
    }
  };

  const updateMedication = async (petId, medId, updates) => {
    try {
      const apiMed = await patch(`/pets/${petId}/medications/${medId}`, updates);
      const updated = toMed(apiMed);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, medications: (pet.medications || []).map((m) => (m.id === medId ? updated : m)) } });
      refreshReminders();
    } catch (err) {
      handleApiError(err);
    }
  };

  const deleteMedication = async (petId, medId) => {
    try {
      await del(`/pets/${petId}/medications/${medId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, medications: (pet.medications || []).filter((m) => m.id !== medId) } });
      refreshReminders();
    } catch (err) {
      handleApiError(err);
    }
  };

  const logMedicationDose = async (petId, medId) => {
    try {
      const log = await post(`/pets/${petId}/medications/${medId}/log`, {});
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({
        type: 'UPDATE_PET',
        payload: {
          ...pet,
          medications: (pet.medications || []).map((m) =>
            m.id === medId ? { ...m, lastAdministeredAt: log?.administered_at || new Date().toISOString() } : m
          ),
        },
      });
    } catch (err) {
      handleApiError(err);
    }
  };

  // ── Lost pets ──

  const refreshPosts = async () => {
    try {
      const apiPosts = await get('/community/posts');
      dispatch({ type: 'SET_POSTS', payload: apiPosts.map(toPost) });
    } catch (err) { handleApiError(err); }
  };

  const refreshLostPets = async () => {
    try {
      const [board, mine] = await Promise.all([get('/lost-pets'), get('/lost-pets/mine')]);
      dispatch({ type: 'SET_LOST_PETS', payload: board.map(toLostPet) });
      dispatch({ type: 'SET_MY_REPORTS', payload: mine.map(toLostPet) });
    } catch (err) { handleApiError(err); }
  };

  const reportPetLost = async (petId, details) => {
    try {
      await post(`/pets/${petId}/lost-report`, {
        last_seen_location: details.lastSeenLocation || null,
        description: details.description || null,
        contact_phone: details.contactPhone || null,
      });
      // Refresh the board/reports and the feed (the broadcast post) — not all pets.
      await Promise.all([refreshLostPets(), refreshPosts()]);
    } catch (err) { handleApiError(err); }
  };

  const resolveLostPet = async (reportId, note) => {
    try {
      await patch(`/lost-pets/${reportId}/resolve`, { resolution_note: note || null });
      await Promise.all([refreshLostPets(), refreshPosts()]);
    } catch (err) { handleApiError(err); }
  };

  // ── Sharing (co-owners) ──

  const refreshInvites = async () => {
    try {
      const apiInvites = await get('/invites');
      dispatch({ type: 'SET_INVITES', payload: apiInvites.map(toInvite) });
    } catch (err) { handleApiError(err); }
  };

  // Owner-side: the roster (owner + members + pending invites) for one pet.
  const getPetShare = async (petId) => {
    try {
      return await get(`/pets/${petId}/members`);
    } catch (err) {
      handleApiError(err);
      return null;
    }
  };

  const invitePetMember = async (petId, email) => {
    // Surface validation errors (already a member, etc.) to the caller.
    return post(`/pets/${petId}/invites`, { email });
  };

  const cancelPetInvite = async (petId, inviteId) => {
    try {
      await del(`/pets/${petId}/invites/${inviteId}`);
    } catch (err) { handleApiError(err); }
  };

  const removePetMember = async (petId, userId) => {
    try {
      await del(`/pets/${petId}/members/${userId}`);
    } catch (err) { handleApiError(err); }
  };

  // Member-side: leave a pet I was shared into → drop it from my list.
  const leavePet = async (petId) => {
    try {
      await post(`/pets/${petId}/leave`);
      dispatch({ type: 'DELETE_PET', payload: petId });
    } catch (err) { handleApiError(err); }
  };

  const acceptInvite = async (inviteId) => {
    try {
      await post(`/invites/${inviteId}/accept`);
      // Drop the resolved invite, then reload so the shared pet (and its
      // sub-resources) appear in the list.
      dispatch({ type: 'SET_INVITES', payload: state.invites.filter((i) => i.id !== inviteId) });
      await loadData();
    } catch (err) { handleApiError(err); }
  };

  const declineInvite = async (inviteId) => {
    try {
      await post(`/invites/${inviteId}/decline`);
      dispatch({ type: 'SET_INVITES', payload: state.invites.filter((i) => i.id !== inviteId) });
    } catch (err) { handleApiError(err); }
  };

  // ── Medical records vault ──

  // Lazy-load a pet's clinics, appointments, and documents together. Returns
  // mapped lists (or null on error) for the records screen to hold locally.
  const getPetRecords = async (petId) => {
    try {
      const [clinics, appointments, documents] = await Promise.all([
        get(`/pets/${petId}/clinics`),
        get(`/pets/${petId}/appointments`),
        get(`/pets/${petId}/documents`),
      ]);
      return {
        clinics: clinics.map(toClinic),
        appointments: appointments.map(toAppointment),
        documents: documents.map(toDocument),
      };
    } catch (err) {
      handleApiError(err);
      return null;
    }
  };

  const addClinic = async (petId, data) => {
    const c = await post(`/pets/${petId}/clinics`, data);
    return toClinic(c);
  };
  const updateClinic = async (petId, id, data) => {
    const c = await patch(`/pets/${petId}/clinics/${id}`, data);
    return toClinic(c);
  };
  const deleteClinic = async (petId, id) => {
    try { await del(`/pets/${petId}/clinics/${id}`); } catch (err) { handleApiError(err); }
  };

  const addAppointment = async (petId, data) => {
    const a = await post(`/pets/${petId}/appointments`, data);
    return toAppointment(a);
  };
  const updateAppointment = async (petId, id, data) => {
    const a = await patch(`/pets/${petId}/appointments/${id}`, data);
    return toAppointment(a);
  };
  const deleteAppointment = async (petId, id) => {
    try { await del(`/pets/${petId}/appointments/${id}`); } catch (err) { handleApiError(err); }
  };

  // file = { uri, name }; fields = { title, category, appointment_id?, clinic_id? }
  const addDocument = async (petId, file, fields) => {
    const d = await uploadDocument(petId, file, fields);
    return toDocument(d);
  };
  const deleteDocument = async (petId, id) => {
    try { await del(`/pets/${petId}/documents/${id}`); } catch (err) { handleApiError(err); }
  };
  // Mint a short-lived signed URL to view a document (files aren't public).
  const getDocumentUrl = async (petId, id) => {
    try {
      const { url } = await get(`/pets/${petId}/documents/${id}/url`);
      return url;
    } catch (err) { handleApiError(err); return null; }
  };

  // ── AI document intake ──
  // Read a document with the AI and store structured suggestions on it.
  // Throws on failure so the screen can show why (timeout, unsupported type…).
  const extractDocument = async (petId, id) => {
    const d = await post(`/pets/${petId}/documents/${id}/extract`);
    track('document_extracted', { category: d.category });
    return toDocument(d);
  };
  // Apply the user's reviewed subset. The created records live in global pet
  // state (vaccinations, meds, weight…), so reload it in the background.
  const applyExtraction = async (petId, id, payload) => {
    const result = await post(`/pets/${petId}/documents/${id}/apply`, payload);
    // Counts only — never the record content itself.
    track('extraction_applied', {
      vaccinations: result.vaccinations?.length || 0,
      medications: result.medications?.length || 0,
      weight: !!result.weight,
      expense: !!result.expense,
    });
    loadData();
    return result;
  };

  // ── Vet share links ──
  // Mint a read-only web link to the pet's medical summary. Throws so the
  // screen can surface failures. Returns { url, expires_at }.
  const createShareLink = async (petId, expiresIn = '24h') => {
    const result = await post(`/pets/${petId}/share-link`, { expires_in: expiresIn });
    track('share_link_created', { expires_in: expiresIn });
    return result;
  };
  // Revoke every outstanding link by rotating the pet's share token.
  const revokeShareLinks = async (petId) => { await del(`/pets/${petId}/share-link`); };

  // ── Caretaker mode ──
  // Owner-authored sitter handoff notes + a time-limited caretaker link.
  const getCareProfile = async (petId) => {
    try { return await get(`/pets/${petId}/care`); } catch (err) { handleApiError(err); return null; }
  };
  const saveCareProfile = async (petId, data) => put(`/pets/${petId}/care`, data);
  const createCareLink = async (petId, expiresIn = '7d') => {
    const result = await post(`/pets/${petId}/care-link`, { expires_in: expiresIn });
    track('care_link_created', { expires_in: expiresIn });
    return result;
  };
  const revokeCareLinks = async (petId) => { await del(`/pets/${petId}/care-link`); };

  // ── Community ──

  const addPost = async (content, imageUrl) => {
    try {
      const apiPost = await post('/community/posts', { content, image_url: imageUrl || null });
      dispatch({ type: 'ADD_POST', payload: toPost(apiPost) });
    } catch (err) {
      handleApiError(err);
    }
  };

  const toggleGroupMembership = async (groupId) => {
    try {
      const apiGroup = await post(`/community/groups/${groupId}/join`);
      dispatch({ type: 'UPDATE_GROUP', payload: toGroup(apiGroup) });
    } catch (err) {
      handleApiError(err);
    }
  };

  const togglePaw = async (postId) => {
    try {
      const apiPost = await post(`/community/posts/${postId}/paw`);
      dispatch({ type: 'UPDATE_POST', payload: toPost(apiPost) });
    } catch (err) {
      handleApiError(err);
    }
  };

  const getComments = async (postId) => {
    try {
      return await get(`/community/posts/${postId}/comments`);
    } catch (err) {
      handleApiError(err);
      return [];
    }
  };

  const addComment = async (postId, content) => {
    try {
      const apiComment = await post(`/community/posts/${postId}/comments`, { content });
      const p = state.posts.find((x) => x.id === postId);
      if (p) dispatch({ type: 'UPDATE_POST', payload: { ...p, comments: (p.comments || 0) + 1 } });
      return apiComment;
    } catch (err) {
      handleApiError(err);
    }
  };

  const deleteComment = async (postId, commentId) => {
    try {
      await del(`/community/posts/${postId}/comments/${commentId}`);
      const p = state.posts.find((x) => x.id === postId);
      if (p) dispatch({ type: 'UPDATE_POST', payload: { ...p, comments: Math.max(0, (p.comments || 0) - 1) } });
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <DataContext.Provider
      value={{
        dataLoaded: state.dataLoaded,
        pets: state.pets,
        posts: state.posts,
        groups: state.groups,
        reminders: state.reminders,
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        lostPets: state.lostPets,
        myReports: state.myReports,
        invites: state.invites,
        addPet,
        updatePet,
        deletePet,
        addVaccination,
        markVaccinationComplete,
        deleteVaccination,
        addFavoriteFood,
        removeFavoriteFood,
        addActivity,
        addWeight,
        deleteWeight,
        addExpense,
        deleteExpense,
        addMedication,
        updateMedication,
        deleteMedication,
        logMedicationDose,
        refreshLostPets,
        reportPetLost,
        resolveLostPet,
        refreshInvites,
        getPetShare,
        invitePetMember,
        cancelPetInvite,
        removePetMember,
        leavePet,
        acceptInvite,
        declineInvite,
        getPetRecords,
        addClinic,
        updateClinic,
        deleteClinic,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        addDocument,
        deleteDocument,
        getDocumentUrl,
        extractDocument,
        applyExtraction,
        createShareLink,
        revokeShareLinks,
        getCareProfile,
        saveCareProfile,
        createCareLink,
        revokeCareLinks,
        addPost,
        togglePaw,
        getComments,
        addComment,
        deleteComment,
        toggleGroupMembership,
        refreshReminders,
        refreshNotifications,
        addReminder,
        updateReminder,
        deleteReminder,
        markNotificationRead,
        snoozeNotification,
        dismissNotification,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
