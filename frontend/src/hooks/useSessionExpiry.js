import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// For queries: a refresh token the server refused ends the session, as
// DataContext's handleApiError does for its own requests, rather than leaving
// a signed-in screen that can't load. Pass the query's error.
export function useLogoutOnExpiredSession(error) {
  const { logout } = useAuth();
  const expired = error?.message === 'SESSION_EXPIRED';
  useEffect(() => {
    if (expired) logout();
    // logout is recreated by AuthContext; the expiry is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);
}
