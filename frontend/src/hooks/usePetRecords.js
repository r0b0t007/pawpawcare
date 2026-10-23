import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { petRecordsQuery } from '../context/DataContext';
import { petRecordsKeys } from './queryKeys';
import { useQueryCacheData } from './useQueryCacheData';

// Every pet with all six sub-resources: the records DataContext's sign-in load
// fills and its mutations write. Two ways to read them:
// - usePetRecords(): what pet screens use. It follows the cache and never
//   starts a fetch.
// - usePetRecordsQuery(): for a screen that re-reads them (the Pets tab).

// Stable while no records are cached, so readers' memos don't rerun.
const NO_PETS = [];

// Re-renders with each write as it lands — a store subscription, not a query
// observer, so reading never starts a 1 + 6N fetch: the sign-in load, full
// reloads and the Pets tab's focus re-read keep the records current.
export function usePetRecords() {
  const { user } = useAuth();
  return useQueryCacheData(petRecordsKeys.list(user?.id), NO_PETS);
}

// Whichever starts first — this hook or the sign-in load — runs the one
// 1 + 6N fetch. Stale after the app-wide five minutes: pass `isStale` to
// useRefetchOnFocus so a screen's focus re-read stays occasional.
export function usePetRecordsQuery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    ...petRecordsQuery(queryClient, petRecordsKeys.list(user?.id)),
    enabled: !!user,
  });
}
