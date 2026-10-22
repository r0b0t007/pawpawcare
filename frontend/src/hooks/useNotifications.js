import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
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

export function useNotificationsQuery() {
  const { user } = useAuth();
  return useQuery({ ...notificationsQuery(user), select: toList });
}

const toUnreadCount = (data) => data.unread_count || 0;

// Home's bell only needs the unread count: no re-render when a read
// notification changes. undefined until the list has loaded (no dot).
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({ ...notificationsQuery(user), select: toUnreadCount });
}
