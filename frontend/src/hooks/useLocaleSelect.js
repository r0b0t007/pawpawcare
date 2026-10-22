import { useCallback } from 'react';
import { useLocale } from '../i18n';

// A React Query `select` that maps the cached server answer item by item, per
// render language. Domain mappers (toInvite, toLostPet, toPost) fill in
// translated fallbacks ("A pet", "Someone") that must follow a language switch
// without a refetch: the cache keeps the raw answer, and a new select per
// language re-runs the mapping. `mapItem` must be stable (a module function).
export function useLocaleSelect(mapItem) {
  const locale = useLocale();
  // The language is the real dependency: mappers read it through i18n.t.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((items) => items.map(mapItem), [mapItem, locale]);
}
