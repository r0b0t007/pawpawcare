import { useCallback, useSyncExternalStore } from 'react';
import { hashKey, useQueryClient } from '@tanstack/react-query';

// One query's cached data, re-rendering with each write as it lands — a store
// subscription, not a query observer, so reading never starts a fetch. For
// data a provider fetches and keeps current itself (the pet records, the
// reminders list). `fallback` must be a stable constant (memos key on it).
export function useQueryCacheData(queryKey, fallback) {
  const queryClient = useQueryClient();
  const hash = hashKey(queryKey);
  const subscribe = useCallback((onChange) => queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash === hash) onChange();
  }), [queryClient, hash]);
  return useSyncExternalStore(subscribe, () => queryClient.getQueryData(queryKey) ?? fallback);
}
