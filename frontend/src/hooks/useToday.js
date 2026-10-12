import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { dayKey } from '../utils/streaks';

// "Today" for screens that stay mounted (tabs): a Date that rolls over at local
// midnight, when the screen regains focus and when the app returns to the
// foreground — so "done today" never keys on yesterday. Same-day refreshes keep
// the previous Date, so nothing re-renders until the day actually changes.
export function useToday() {
  const [today, setToday] = useState(() => new Date());

  const refresh = useCallback(() => {
    setToday((prev) => (dayKey(prev) === dayKey(new Date()) ? prev : new Date()));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const midnight = new Date(today);
    midnight.setHours(24, 0, 1, 0);
    const timer = setTimeout(refresh, Math.max(1000, midnight - Date.now()));
    return () => clearTimeout(timer);
  }, [today, refresh]);

  return today;
}
