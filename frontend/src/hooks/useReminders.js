import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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

// Re-read the list when a screen is shown — opened or focused again — if it
// is stale (refreshReminders({ ifStale: true }) owns the rule: not while a
// read is on its way, not before the first load, and a failed list is re-read).
export function useRefreshRemindersOnFocus() {
  const { refreshReminders } = useData();
  const refreshRef = useRef(refreshReminders);
  refreshRef.current = refreshReminders;
  useFocusEffect(useCallback(() => {
    refreshRef.current({ ifStale: true });
  }, []));
}
