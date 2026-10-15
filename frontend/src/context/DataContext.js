import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { PET_COLOR_PAIRS } from '../theme';

const PET_BGS = PET_COLOR_PAIRS.map((p) => p.bg);
import { get, post, patch, put, del, uploadDocument } from '../services/api';
import { scheduleLocalReminders } from '../services/notifications';
import { track } from '../services/analytics';
import { getPref, setPref } from '../services/prefs';
import { noteGoodMoment } from '../services/storeReview';
import { addDoseDay, dayKey } from '../utils/streaks';
import { addDoseCount, mergeDoseHistory } from '../utils/doses';
import { vaxStatusOn } from '../utils/vaccines';
import { useTickAt } from '../hooks/useTickAt';
import { petsKeys, gamificationKeys } from '../hooks/queryKeys';

const DataContext = createContext(null);

// ── Date helpers ──────────────────────────────────────────────────────────────

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
  // Same rule as the midnight rollover (ROLL_VAX_STATUS): a freshly added
  // past-dated record lands in "Needs attention" immediately.
  const status = vaxStatusOn(v.status, v.due_date);
  return {
    id: v.id,
    name: v.name,
    // Keep ISO (YYYY-MM-DD): every consumer parses (`${dueDate}T12:00:00`)
    // or sorts (localeCompare) this field — a locale display string here broke
    // both on Hermes, silently hiding fresh records from the Health hub and
    // Dashboard until a full re-login reloaded them. Format only at display
    // time (see formatDisplay/shortDate in the screens).
    dueDate: v.due_date || null,
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
  adoptedOn: apiPet.adopted_on || null, // "gotcha day" — drives care anniversaries
  weight: apiPet.weight?.toString() ?? null,
  weightUnit: apiPet.weight_unit || 'kg',
  gender: apiPet.gender,
  microchipped: apiPet.microchipped,
  color: apiPet.color || PET_BGS[index % PET_BGS.length],
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
  paws: p.paw_count ?? 0,
  pawedBy: p.pawed_by_me ? ['me'] : [],
  pawedByMe: p.pawed_by_me,
  comments: p.comment_count ?? 0,
  imageUrl: p.image_url || null,
  // I reported this post → the feed renders it collapsed with an Undo.
  reportedByMe: !!p.reported_by_me,
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

// A minute and a half after a reminder fires: time for the server's scheduler
// (every minute) to advance a recurring reminder's next_fire_at.
const REMINDER_REFETCH_DELAY = 90000;

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
    // Trust: when the store last successfully synced with the server (ms
    // epoch, or null before the first sync / after logout).
    case 'SET_LAST_SYNCED':   return { ...state, lastSyncedAt: action.payload };
    // Device-local dose-day history per medication id ({ [medId]: ['YYYY-MM-DD'] })
    // — drives the daily-med streak until the Phase-2 server summary exists.
    case 'SET_MED_DOSE_DAYS': return { ...state, medDoseDays: action.payload };
    // Device-local doses per medication per day ({ [medId]: { 'YYYY-MM-DD': n } })
    // — lets a twice-daily med read "1 of 2" instead of done after one dose.
    case 'SET_MED_DOSE_COUNTS': return { ...state, medDoseCounts: action.payload };
    // The day rolled over while the app stayed open: re-derive every open
    // vaccination's status for the new day, so "due soon" yesterday reads
    // "overdue" today on every screen without a reload.
    case 'ROLL_VAX_STATUS': {
      const today = action.payload;
      let changed = false;
      const pets = state.pets.map((p) => {
        let petChanged = false;
        const vaccinations = (p.vaccinations || []).map((v) => {
          const status = vaxStatusOn(v.status, v.dueDate, today);
          if (status === v.status) return v;
          petChanged = true;
          return { ...v, status };
        });
        if (!petChanged) return p;
        changed = true;
        return { ...p, vaccinations };
      });
      return changed ? { ...state, pets } : state;
    }
    // Stored history merged into the CURRENT in-memory maps (never replacing
    // them): a dose logged just before a refresh may not be persisted yet.
    case 'HYDRATE_DOSES': {
      const { doseDays, doseCounts } = mergeDoseHistory(
        action.payload.stored,
        { doseDays: state.medDoseDays, doseCounts: state.medDoseCounts },
        action.payload.medIds,
      );
      return { ...state, medDoseDays: doseDays, medDoseCounts: doseCounts };
    }
    // A saved dose, applied to the CURRENT state (not a snapshot captured
    // when the request started) so two doses logged at once both land.
    case 'DOSE_LOGGED': {
      const { petId, medId, at } = action.payload;
      return {
        ...state,
        pets: state.pets.map((p) => (p.id !== petId ? p : {
          ...p,
          medications: (p.medications || []).map((m) => (m.id === medId ? { ...m, lastAdministeredAt: at } : m)),
        })),
        medDoseDays: { ...state.medDoseDays, [medId]: addDoseDay(state.medDoseDays[medId], at) },
        medDoseCounts: addDoseCount(state.medDoseCounts, medId, at),
      };
    }
    default:           return state;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(dataReducer, {
    pets: [], posts: [], groups: [], reminders: [], notifications: [], unreadCount: 0,
    lostPets: [], myReports: [], invites: [], dataLoaded: false, lastSyncedAt: null,
    medDoseDays: {}, medDoseCounts: {},
  });
  const { user, logout } = useAuth();
  // The pets loader reads the current list to keep a pet's last good data
  // when one of its requests fails (see loadData).
  const petsRef = useRef(state.pets);
  petsRef.current = state.pets;

  // Midnight rollover: statuses were derived for the day the data loaded.
  // Re-derive them when the local day changes — on a timer while the app is
  // open, and when it comes back to the foreground.
  const statusDay = useRef(dayKey());
  useEffect(() => {
    const roll = () => {
      const key = dayKey();
      if (key === statusDay.current) return;
      statusDay.current = key;
      dispatch({ type: 'ROLL_VAX_STATUS', payload: new Date() });
    };
    let timer;
    const arm = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => { roll(); arm(); }, midnight - Date.now());
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') roll(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []);

  // When a reminder fires, the server moves a recurring one's next_fire_at
  // forward — refetch shortly after so the lists show the next occurrence
  // instead of dropping it (only one-off reminders leave once fired).
  const reminderTimes = useMemo(
    () => state.reminders.map((r) => new Date(r.next_fire_at || r.fire_at).getTime()).filter(Number.isFinite),
    [state.reminders],
  );
  const reminderTick = useTickAt(reminderTimes, REMINDER_REFETCH_DELAY);
  useEffect(() => {
    if (reminderTick > 0 && user) refreshReminders();
    // refreshReminders is recreated each render; the tick is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderTick]);

  // Dose history is persisted from state (after DOSE_LOGGED), but only once
  // hydrateDoseDays has loaded what's stored — never an empty pre-load map.
  const doseHistoryReady = useRef(false);
  useEffect(() => {
    if (!doseHistoryReady.current) return;
    setPref('medDoseDays', state.medDoseDays);
    setPref('medDoseCounts', state.medDoseCounts);
  }, [state.medDoseDays, state.medDoseCounts]);
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
      dispatch({ type: 'SET_LAST_SYNCED', payload: null });
      // History stays in AsyncStorage (device-local, med ids are UUIDs) but is
      // cleared from memory so a different account never renders it — and the
      // persist effect is paused first so the empty maps never overwrite it.
      doseHistoryReady.current = false;
      dispatch({ type: 'SET_MED_DOSE_DAYS', payload: {} });
      dispatch({ type: 'SET_MED_DOSE_COUNTS', payload: {} });
    }
  }, [user?.id]);

  // Mutation contract: every add/update/delete/toggle below resolves a truthy
  // value on success (the saved entity, or true) and false on failure. Errors
  // are handled here (session expiry logs out), never thrown, so a screen
  // confirms only what was actually saved. (The medical-vault add/update calls
  // throw instead: their forms show the API's validation messages.)
  //   if (await addWeight(...)) showToast('Weight logged'); else showToast("Couldn't …");
  const handleApiError = (err) => {
    if (err.message === 'SESSION_EXPIRED') logout();
  };

  // Every care completion: analytics + a gamification refetch, so streaks and
  // milestones computed by the nightly job surface without a full reload.
  // It's also a good moment for the rating prompt (services/storeReview) —
  // except an upload, which usually continues straight into the AI read and
  // its review sheet; applying that extraction is the good moment instead.
  const trackCareAction = (actionType) => {
    track('care_action_completed', { action_type: actionType });
    queryClient.invalidateQueries({ queryKey: gamificationKeys.summary });
    if (actionType !== 'document_uploaded') noteGoodMoment('care_action');
  };

  // Each domain loads and dispatches independently, so one failed request
  // only loses that domain — a transient blip on any single endpoint used to
  // discard the entire store (dashboard showed 0 pets until a full reload).
  const loadData = async () => {
    const loaders = [
      async () => {
        // Pets and my lost-pet reports land together: PetProfile derives its
        // report-lost / mark-found actions from BOTH, and a half-loaded pair
        // renders the wrong action (e.g. "report as lost" for a lost pet).
        const [apiPets, apiMyReports] = await Promise.all([get('/pets'), get('/lost-pets/mine')]);

        // Each pet has six sub-resources, so a load is 1 + 6N requests. One
        // failure among them used to reject the whole domain: no pets for the
        // rest of the session (Home said "Welcome to PawPawCare", every
        // profile said "Pet not found") while the Pets tab, on React Query,
        // still listed them. Now a failed request keeps that pet's last good
        // copy of the field; with none, the field is listed in pet.missing so
        // screens don't read the empty list as "nothing on record". The domain
        // still counts as failed below (logged as a partial load).
        const previous = new Map(petsRef.current.map((p) => [p.id, p]));
        const failures = [];
        const fetchList = (petId, resource) =>
          get(`/pets/${petId}/${resource}`).catch((err) => {
            // An expired session ends the load (and signs out below) at once,
            // instead of after every other request has failed the same way.
            if (err?.message === 'SESSION_EXPIRED') throw err;
            failures.push(err);
            return null;
          });
        // API resource → field on the mapped pet (toPet's option names
        // match the resources except foods → favoriteFoods).
        const FIELDS = {
          vaccinations: 'vaccinations', activities: 'activities', foods: 'favoriteFoods',
          medications: 'medications', weights: 'weights', expenses: 'expenses',
        };
        const RESOURCES = Object.keys(FIELDS);
        const buildPet = (apiPet, i, lists) => {
          const loaded = Object.fromEntries(Object.entries(lists).filter(([, list]) => list));
          const pet = toPet(apiPet, { ...loaded, index: i });
          const old = previous.get(apiPet.id);
          const missing = [];
          for (const [resource, field] of Object.entries(FIELDS)) {
            if (loaded[resource]) continue;
            if (old) pet[field] = old[field];
            if (!old || old.missing?.includes(field)) missing.push(field);
          }
          if (missing.length) pet.missing = missing;
          return pet;
        };

        const listsByPet = await Promise.all(
          apiPets.map((p) => Promise.all(RESOURCES.map((r) => fetchList(p.id, r))))
        );
        const petsWithData = apiPets.map((apiPet, i) =>
          buildPet(apiPet, i, Object.fromEntries(RESOURCES.map((r, j) => [r, listsByPet[i][j]])))
        );
        dispatch({ type: 'SET_PETS', payload: petsWithData });
        dispatch({ type: 'SET_MY_REPORTS', payload: apiMyReports.map(toLostPet) });
        // Hydrating prunes the stored dose history of every med it isn't
        // given, so a pet whose medications never loaded would lose its
        // history for good. Skip it; the next full load hydrates.
        if (!petsWithData.some((p) => p.missing?.includes('medications'))) hydrateDoseDays(petsWithData);

        if (failures.length) throw new Error(`${failures.length} pet request(s) failed`);
      },
      () => refreshPosts({ rethrow: true }),
      async () => {
        const apiGroups = await get('/community/groups');
        dispatch({ type: 'SET_GROUPS', payload: apiGroups.map(toGroup) });
      },
      () => refreshReminders({ rethrow: true }),
      () => refreshNotifications({ rethrow: true }),
      () => refreshInvites({ rethrow: true }),
    ];

    const results = await Promise.allSettled(loaders.map((load) => load()));
    const failed = results.filter((r) => r.status === 'rejected');
    // Log out once, however many loaders hit the expired session — logout()
    // has no in-flight guard, so a per-failure handleApiError would fire it
    // up to once per domain.
    if (failed.some((r) => r.reason?.message === 'SESSION_EXPIRED')) logout();
    if (failed.length) {
      console.warn(`[data] ${failed.length}/${loaders.length} domains failed to load; kept previous state for those`);
    }
    // Initial fan-out finished (even with failures) — screens can report TTI.
    dispatch({ type: 'SET_DATA_LOADED', payload: true });
    // Only stamp the sync time when every domain landed — a partial load must
    // not read as "synced" (honest state; refreshReminders stamps on its own
    // success, so a reminders-only recovery still updates the line).
    if (!failed.length) dispatch({ type: 'SET_LAST_SYNCED', payload: Date.now() });
  };

  // Merge the persisted dose-day history with each med's server-side
  // last_administered_at, so pre-feature doses and family members' doses at
  // least register their day. Prunes meds that no longer exist. Best-effort:
  // the streak chip is supplementary — it must never break data loading.
  const hydrateDoseDays = async (pets) => {
    try {
      const stored = await getPref('medDoseDays', {});
      const storedCounts = await getPref('medDoseCounts', {});
      const doseDays = {};
      const medIds = [];
      for (const pet of pets) {
        for (const med of pet.medications || []) {
          medIds.push(med.id);
          let days = stored[med.id] || [];
          if (med.lastAdministeredAt) days = addDoseDay(days, med.lastAdministeredAt);
          if (days.length) doseDays[med.id] = days;
        }
      }
      dispatch({ type: 'HYDRATE_DOSES', payload: { stored: { doseDays, doseCounts: storedCounts }, medIds } });
    } catch {
      // Storage unreadable: keep whatever is in state.
    } finally {
      // Persist from here on either way — a failed read must not silently
      // stop every later dose from being saved for the rest of the session.
      doseHistoryReady.current = true;
    }
  };

  // ── Reminders & notifications ──

  // refresh* helpers swallow errors via handleApiError by default; loadData
  // passes { rethrow: true } to own error handling itself (allSettled counts
  // the failure and logs out at most once across all domains).
  // Overlapping refreshes (a vaccination change right after another, or a
  // tick/focus refetch) can resolve out of order; only the newest request may
  // write, or a stale list could reschedule a dose that was just marked given.
  const remindersRequest = useRef(0);
  const refreshReminders = async ({ rethrow = false } = {}) => {
    const request = ++remindersRequest.current;
    try {
      const reminders = await get('/reminders');
      if (request !== remindersRequest.current) return;
      dispatch({ type: 'SET_REMINDERS', payload: reminders });
      dispatch({ type: 'SET_LAST_SYNCED', payload: Date.now() });
      scheduleLocalReminders(reminders);
    } catch (err) { if (rethrow) throw err; handleApiError(err); }
  };

  const refreshNotifications = async ({ rethrow = false } = {}) => {
    try {
      const data = await get('/notifications');
      dispatch({ type: 'SET_NOTIFICATIONS', payload: data });
    } catch (err) { if (rethrow) throw err; handleApiError(err); }
  };

  const addReminder = async (payload) => {
    try {
      await post('/reminders', payload);
      await refreshReminders();
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const updateReminder = async (id, updates) => {
    try {
      await patch(`/reminders/${id}`, updates);
      await refreshReminders();
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const deleteReminder = async (id) => {
    try {
      await del(`/reminders/${id}`);
      await refreshReminders();
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const markNotificationRead = async (id) => {
    try {
      await post(`/notifications/${id}/read`);
      await refreshNotifications();
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const snoozeNotification = async (id, minutes = 60) => {
    try {
      await post(`/notifications/${id}/snooze`, { minutes });
      await Promise.all([refreshNotifications(), refreshReminders()]);
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const dismissNotification = async (id) => {
    try {
      await post(`/notifications/${id}/dismiss`);
      await refreshNotifications();
      return true;
    } catch (err) { handleApiError(err); return false; }
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
        adopted_on: petData.adoptedOn || null,
        weight: petData.weight ? parseFloat(petData.weight) : null,
        weight_unit: petData.weightUnit || 'kg',
        gender: petData.gender || null,
        microchipped: petData.microchipped || false,
        color: petData.color || PET_BGS[state.pets.length % PET_BGS.length],
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
      return false;
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
      if (updates.adoptedOn !== undefined)   apiUpdate.adopted_on = updates.adoptedOn || null;
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
            // Map the frontend shape back to the API keys toVax reads — both
            // dates, or the round-trip silently drops administered_date.
            vaccinations: existing.vaccinations.map((v) => ({
              ...v,
              due_date: v.dueDate,
              administered_date: v.administeredDate,
            })),
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
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const deletePet = async (petId) => {
    try {
      await del(`/pets/${petId}`);
      dispatch({ type: 'DELETE_PET', payload: petId });
      queryClient.invalidateQueries({ queryKey: petsKeys.all });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  // ── Vaccination ──

  // Shared tail of every vaccination mutation: apply the change to the pet's
  // local list, then mark the pets query stale so migrated screens refetch.
  // Guard: if the pet isn't in the store (mid-reload), skip the local update
  // rather than throwing AFTER the server write — a swallowed TypeError here
  // would hide the change until the next full load; the invalidated query is
  // the recovery path either way.
  const applyVaxChange = (petId, mutate) => {
    const pet = state.pets.find((p) => p.id === petId);
    if (pet) {
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, vaccinations: mutate(pet.vaccinations || []) } });
    }
    queryClient.invalidateQueries({ queryKey: petsKeys.all });
    // The server creates/removes the vaccination's due-date reminder: refetch
    // so Health and Reminders match and this device's local notifications are
    // rescheduled (a dose marked given must not still notify).
    refreshReminders();
  };

  const addVaccination = async (petId, vaccination) => {
    try {
      const apiVax = await post(`/pets/${petId}/vaccinations`, {
        name: vaccination.name,
        due_date: parseToISO(vaccination.dueDate),
        notes: vaccination.notes || null,
      });
      const newVax = toVax(apiVax);
      applyVaxChange(petId, (vaxes) => [...vaxes, newVax]);
      return newVax;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const markVaccinationComplete = async (petId, vaccinationId) => {
    try {
      const apiVax = await patch(`/pets/${petId}/vaccinations/${vaccinationId}/complete`, {});
      const updated = toVax(apiVax);
      applyVaxChange(petId, (vaxes) => vaxes.map((v) => (v.id === vaccinationId ? updated : v)));
      trackCareAction('vaccination_done');
      return true;
    } catch (err) {
      handleApiError(err);
      // Callers celebrate only a saved completion; false means nothing changed.
      return false;
    }
  };

  const deleteVaccination = async (petId, vaccinationId) => {
    try {
      await del(`/pets/${petId}/vaccinations/${vaccinationId}`);
      applyVaxChange(petId, (vaxes) => vaxes.filter((v) => v.id !== vaccinationId));
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  // ── Favorite Foods ──

  const addFavoriteFood = async (petId, foodName) => {
    try {
      const apiFood = await post(`/pets/${petId}/foods`, { name: foodName });
      const newFood = toFood(apiFood);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, favoriteFoods: [...pet.favoriteFoods, newFood] } });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const removeFavoriteFood = async (petId, foodId) => {
    try {
      await del(`/pets/${petId}/foods/${foodId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, favoriteFoods: pet.favoriteFoods.filter((f) => f.id !== foodId) } });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
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
      trackCareAction('activity_added');
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
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
      trackCareAction('weight_logged');
      return newW;
    } catch (err) {
      handleApiError(err);
      return false;
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
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
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
      trackCareAction('expense_added');
      return newE;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const deleteExpense = async (petId, expenseId) => {
    try {
      await del(`/pets/${petId}/expenses/${expenseId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, expenses: (pet.expenses || []).filter((e) => e.id !== expenseId) } });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
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
      return false;
    }
  };

  const updateMedication = async (petId, medId, updates) => {
    try {
      const apiMed = await patch(`/pets/${petId}/medications/${medId}`, updates);
      const updated = toMed(apiMed);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, medications: (pet.medications || []).map((m) => (m.id === medId ? updated : m)) } });
      refreshReminders();
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const deleteMedication = async (petId, medId) => {
    try {
      await del(`/pets/${petId}/medications/${medId}`);
      const pet = state.pets.find((p) => p.id === petId);
      dispatch({ type: 'UPDATE_PET', payload: { ...pet, medications: (pet.medications || []).filter((m) => m.id !== medId) } });
      refreshReminders();
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const logMedicationDose = async (petId, medId) => {
    try {
      const log = await post(`/pets/${petId}/medications/${medId}/log`, {});
      // The reducer extends the device-local streak history and today's dose
      // count with the server's timestamp for the dose (falling back to now);
      // the persist effect above saves both.
      dispatch({
        type: 'DOSE_LOGGED',
        payload: { petId, medId, at: log?.administered_at || new Date().toISOString() },
      });
      trackCareAction('dose_logged');
      return true;
    } catch (err) {
      handleApiError(err);
      // Callers celebrate only a saved dose; false means nothing was logged.
      return false;
    }
  };

  // ── Lost pets ──

  const refreshPosts = async ({ rethrow = false } = {}) => {
    try {
      const apiPosts = await get('/community/posts');
      dispatch({ type: 'SET_POSTS', payload: apiPosts.map(toPost) });
    } catch (err) { if (rethrow) throw err; handleApiError(err); }
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
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const resolveLostPet = async (reportId, note) => {
    try {
      await patch(`/lost-pets/${reportId}/resolve`, { resolution_note: note || null });
      await Promise.all([refreshLostPets(), refreshPosts()]);
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  // ── Sharing (co-owners) ──

  const refreshInvites = async ({ rethrow = false } = {}) => {
    try {
      const apiInvites = await get('/invites');
      dispatch({ type: 'SET_INVITES', payload: apiInvites.map(toInvite) });
    } catch (err) { if (rethrow) throw err; handleApiError(err); }
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
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const removePetMember = async (petId, userId) => {
    try {
      await del(`/pets/${petId}/members/${userId}`);
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  // Member-side: leave a pet I was shared into → drop it from my list.
  const leavePet = async (petId) => {
    try {
      await post(`/pets/${petId}/leave`);
      dispatch({ type: 'DELETE_PET', payload: petId });
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const acceptInvite = async (inviteId) => {
    try {
      await post(`/invites/${inviteId}/accept`);
      // Drop the resolved invite, then reload so the shared pet (and its
      // sub-resources) appear in the list.
      dispatch({ type: 'SET_INVITES', payload: state.invites.filter((i) => i.id !== inviteId) });
      await loadData();
      return true;
    } catch (err) { handleApiError(err); return false; }
  };

  const declineInvite = async (inviteId) => {
    try {
      await post(`/invites/${inviteId}/decline`);
      dispatch({ type: 'SET_INVITES', payload: state.invites.filter((i) => i.id !== inviteId) });
      return true;
    } catch (err) { handleApiError(err); return false; }
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
    try { await del(`/pets/${petId}/clinics/${id}`); return true; } catch (err) { handleApiError(err); return false; }
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
    try { await del(`/pets/${petId}/appointments/${id}`); return true; } catch (err) { handleApiError(err); return false; }
  };

  // file = { uri, name }; fields = { title, category, appointment_id?, clinic_id? }
  const addDocument = async (petId, file, fields) => {
    const d = await uploadDocument(petId, file, fields);
    trackCareAction('document_uploaded');
    return toDocument(d);
  };
  const deleteDocument = async (petId, id) => {
    try { await del(`/pets/${petId}/documents/${id}`); return true; } catch (err) { handleApiError(err); return false; }
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
    noteGoodMoment('extraction_applied');
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
    // The API returns an empty shell when no profile exists, so any failure is
    // a real error — rethrow so callers can tell "failed" from "nothing saved"
    // (a blank form on failure invites overwriting real notes with nulls).
    try { return await get(`/pets/${petId}/care`); } catch (err) { handleApiError(err); throw err; }
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
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const toggleGroupMembership = async (groupId) => {
    try {
      const apiGroup = await post(`/community/groups/${groupId}/join`);
      dispatch({ type: 'UPDATE_GROUP', payload: toGroup(apiGroup) });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  const togglePaw = async (postId) => {
    try {
      const apiPost = await post(`/community/posts/${postId}/paw`);
      dispatch({ type: 'UPDATE_POST', payload: toPost(apiPost) });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  // Flag a post for moderation (idempotent server-side). The API returns the
  // post with `reported_by_me` set, which keeps the store's collapsed state in
  // sync; a feed refresh persists it via the same flag.
  const reportPost = async (postId) => {
    try {
      const apiPost = await post(`/community/posts/${postId}/report`);
      dispatch({ type: 'UPDATE_POST', payload: toPost(apiPost) });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  // Undo my report ("Undo" on the hidden card) and restore the post.
  const unreportPost = async (postId) => {
    try {
      const apiPost = await del(`/community/posts/${postId}/report`);
      dispatch({ type: 'UPDATE_POST', payload: toPost(apiPost) });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  // null on failure, never [] — an empty list would read as "no comments".
  const getComments = async (postId) => {
    try {
      return await get(`/community/posts/${postId}/comments`);
    } catch (err) {
      handleApiError(err);
      return null;
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
      return false;
    }
  };

  const deleteComment = async (postId, commentId) => {
    try {
      await del(`/community/posts/${postId}/comments/${commentId}`);
      const p = state.posts.find((x) => x.id === postId);
      if (p) dispatch({ type: 'UPDATE_POST', payload: { ...p, comments: Math.max(0, (p.comments || 0) - 1) } });
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  return (
    <DataContext.Provider
      value={{
        dataLoaded: state.dataLoaded,
        lastSyncedAt: state.lastSyncedAt,
        pets: state.pets,
        posts: state.posts,
        groups: state.groups,
        reminders: state.reminders,
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        lostPets: state.lostPets,
        myReports: state.myReports,
        invites: state.invites,
        medDoseDays: state.medDoseDays,
        medDoseCounts: state.medDoseCounts,
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
        reportPost,
        unreportPost,
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
