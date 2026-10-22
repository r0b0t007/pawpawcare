// Central React Query key registry. One entry per migrated domain — screens and
// DataContext invalidations must both import these keys, never inline literals.
export const petsKeys = {
  all: ['pets'],
};

// Every pet with all six sub-resources, as DataContext's sign-in load builds
// it. Kept under its own root so the light pets list's invalidations (petsKeys)
// never re-run the 1 + 6N load.
export const petRecordsKeys = {
  all: ['petRecords'],
  list: (userId) => ['petRecords', userId ?? null],
};

export const subscriptionKeys = {
  all: ['subscription'],
  // Per account: RevenueCat can target different offerings per customer.
  offerings: (userId) => ['subscription', 'offerings', userId ?? null],
};

// Seeded group names come back in the account's saved language, so the locale
// is part of the key (see useGroups.js); membership is per account. The feed
// (useFeed.js) carries per-account flags (pawed / reported by me).
export const communityKeys = {
  all: ['community'],
  feed: (userId) => ['community', 'feed', userId ?? null],
  groupsFor: (userId) => ['community', 'groups', userId ?? null],
  groups: (userId, locale) => ['community', 'groups', userId ?? null, locale ?? null],
};

// Invitations addressed to the signed-in account (see useInvites.js).
export const invitesKeys = {
  all: ['invites'],
  list: (userId) => ['invites', userId ?? null],
};

// Lost-pet reports: the community board and the signed-in account's own
// reports (see useLostPets.js).
export const lostPetsKeys = {
  all: ['lostPets'],
  board: (userId) => ['lostPets', 'board', userId ?? null],
  mine: (userId) => ['lostPets', 'mine', userId ?? null],
};

// The in-app notification list and its unread count (see useNotifications.js).
export const notificationsKeys = {
  all: ['notifications'],
  list: (userId) => ['notifications', userId ?? null],
};

// A pet's medical records vault: clinics, visits and documents together
// (see useVault.js).
export const vaultKeys = {
  all: ['vault'],
  pet: (userId, petId) => ['vault', userId ?? null, petId],
};

export const gamificationKeys = {
  summary: ['gamification', 'summary'],
  recap: ['gamification', 'recap'],
};
