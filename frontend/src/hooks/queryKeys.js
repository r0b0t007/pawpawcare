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

export const gamificationKeys = {
  summary: ['gamification', 'summary'],
  recap: ['gamification', 'recap'],
};
