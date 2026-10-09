import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// Refetch when the screen regains focus, so edits made on other screens
// (vaccinations, pet profile) show up without wiring every mutation.
// Skips the initial focus — useQuery already fetches on mount.
// Domain-agnostic: used by pets and gamification queries alike.
//
// refetch() ignores React Query's staleTime, so queries that set one pass
// `isStale` (from useQuery) and are only refetched once they're stale.
export function useRefetchOnFocus(refetch, { isStale } = {}) {
  const firstRun = useRef(true);
  const isStaleRef = useRef(isStale);
  isStaleRef.current = isStale;
  useFocusEffect(
    useCallback(() => {
      if (firstRun.current) {
        firstRun.current = false;
        return;
      }
      if (isStaleRef.current === false) return;
      refetch();
    }, [refetch])
  );
}
