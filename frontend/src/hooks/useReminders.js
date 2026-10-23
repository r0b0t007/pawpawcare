import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { remindersKeys } from './queryKeys';
import { useQueryCacheData } from './useQueryCacheData';

// The reminders list — also this device's notification schedule. DataContext
// fetches it (refreshReminders: only the newest answer lands) and one listener
// there schedules each new list; reading it never starts a fetch.
const NO_REMINDERS = [];

export function useReminders() {
  const { user } = useAuth();
  return useQueryCacheData(remindersKeys.list(user?.id), NO_REMINDERS);
}

// The app-wide staleTime: a list older than this re-reads when its screen is
// shown again (the new list reschedules through the same listener).
export const REMINDERS_STALE_MS = 5 * 60 * 1000;

// Re-read the list when a screen is shown — opened or focused again — and the
// list is stale. (Reading it never fetches, so opening a screen on a stale
// list re-reads it too; a fresh one is left alone.)
export function useRefreshRemindersOnFocus() {
  const { user } = useAuth();
  const { refreshReminders } = useData();
  const queryClient = useQueryClient();
  const refreshRef = useRef(refreshReminders);
  refreshRef.current = refreshReminders;
  useFocusEffect(useCallback(() => {
    const state = queryClient.getQueryState(remindersKeys.list(user?.id));
    if (state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < REMINDERS_STALE_MS) return;
    refreshRef.current();
  }, [queryClient, user?.id]));
}
