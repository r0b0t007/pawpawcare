// Central React Query key registry. One entry per migrated domain — screens and
// DataContext invalidations must both import these keys, never inline literals.
export const petsKeys = {
  all: ['pets'],
};

export const gamificationKeys = {
  summary: ['gamification', 'summary'],
};
