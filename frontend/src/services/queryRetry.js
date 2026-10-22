// React Query's retry rule for the app. A refused refresh token
// (SESSION_EXPIRED) is final, so retrying it only delays the logout that
// DataContext runs when a query fails that way; anything else gets two more
// tries.
export const MAX_QUERY_RETRIES = 2;

export const retryQuery = (failureCount, error) =>
  error?.message !== 'SESSION_EXPIRED' && failureCount < MAX_QUERY_RETRIES;
