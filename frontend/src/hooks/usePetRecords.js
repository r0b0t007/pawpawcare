import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { petRecordsQuery } from '../context/DataContext';
import { petRecordsKeys } from './queryKeys';

// Every pet with all six sub-resources: the records DataContext's sign-in load
// fills and its mutations write, read straight from the cache. Whichever
// starts first — this hook or the sign-in load — runs the one 1 + 6N fetch.
// Stale after the app-wide five minutes: pass `isStale` to useRefetchOnFocus
// so a screen's focus re-read stays occasional.
export function usePetRecordsQuery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    ...petRecordsQuery(queryClient, petRecordsKeys.list(user?.id)),
    enabled: !!user,
  });
}
