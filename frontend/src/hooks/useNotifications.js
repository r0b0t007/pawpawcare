import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '../services/api';
import { addNotificationReceivedListener, addNotificationResponseListener } from '../services/notifications';
import { useAuth } from '../context/AuthContext';
import { notificationsKeys } from './queryKeys';

// The in-app notification list ({ notifications, unread_count } from the
// server). Marking read, snoozing and dismissing stay in DataContext, which
// re-read it before resolving. Titles and bodies come from the server as
// written, so there is nothing to map per language.
const notificationsQuery = (user) => ({
  queryKey: notificationsKeys.list(user?.id),
  queryFn: () => get('/notifications'),
  enabled: !!user,
});

const toList = (data) => ({
  notifications: data.notifications || [],
  unreadCount: data.unread_count || 0,
});

// The inbox always re-reads when it opens: it is where a tapped push lands,
// and Home's bell may have fetched the list moments before it arrived.
export function useNotificationsQuery() {
  const { user } = useAuth();
  return useQuery({ ...notificationsQuery(user), select: toList, refetchOnMount: 'always' });
}

const toUnreadCount = (data) => data.unread_count || 0;

// Home's bell only needs the unread count: no re-render when a read
// notification changes. undefined until the list has loaded (no dot).
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({ ...notificationsQuery(user), select: toUnreadCount });
}

// New notifications are created on the server (a reminder's delivery, a push)
// while the list is cached, so the list and the bell re-read when one is shown
// or tapped, and when the app comes back to the foreground — not on the
// five-minute staleTime. Rendered once, inside the QueryClientProvider.
export function NotificationsRefresher() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const reread = () => { queryClient.invalidateQueries({ queryKey: notificationsKeys.all }); };
    const received = addNotificationReceivedListener(reread);
    const tapped = addNotificationResponseListener(reread);
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') reread(); });
    return () => { received.remove(); tapped.remove(); app.remove(); };
  }, [queryClient]);
  return null;
}
