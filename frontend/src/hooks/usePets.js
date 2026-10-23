import { useCallback, useSyncExternalStore } from 'react';
import { hashKey, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { petRecordsKeys, petsKeys } from './queryKeys';

// Just the pets — names and photos — for Home to show while the full records
// (usePetRecordsQuery: 1 + 6N requests) are still loading. The records load
// puts them here from its own /pets answer, so there is no fetch of its own
// (one /pets request at sign-in, not two). Anything that needs a pet's
// records (vaccinations included) reads those.
// `options` pass through to useQuery (Home reads it only during the first
// load: `{ enabled: !dataLoaded }`).
export function usePetsQuery(options = {}) {
  return useQuery({ queryKey: petsKeys.all, queryFn: skipToken, ...options });
}

// Stable while no records are cached, so readers' memos don't rerun.
const NO_PETS = [];

// Every pet with all six sub-resources, as every pet screen reads them: from
// the cache, re-rendering with each write as it lands — a store subscription,
// not a query observer, so reading never starts a fetch (the sign-in load,
// full reloads and the Pets tab's focus re-read keep them current; see
// usePetRecordsQuery for a screen that should re-read).
export function usePetRecords() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = petRecordsKeys.list(user?.id);
  const hash = hashKey(queryKey);
  const subscribe = useCallback((onChange) => queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === hash) onChange();
  }), [queryClient, hash]);
  return useSyncExternalStore(subscribe, () => queryClient.getQueryData(queryKey) ?? NO_PETS);
}
