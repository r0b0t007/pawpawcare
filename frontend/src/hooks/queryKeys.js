// Central React Query key registry. One entry per migrated domain — screens and
// DataContext invalidations must both import these keys, never inline literals.
export const petsKeys = {
  all: ['pets'],
};

export const subscriptionKeys = {
  all: ['subscription'],
  // Per account: RevenueCat can target different offerings per customer.
  offerings: (userId) => ['subscription', 'offerings', userId ?? null],
};

// Seeded group names come back in the account's saved language, so the locale
// is part of the key (see useGroups.js); membership is per account.
export const communityKeys = {
  all: ['community'],
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

export const gamificationKeys = {
  summary: ['gamification', 'summary'],
  recap: ['gamification', 'recap'],
};
