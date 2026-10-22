import { MAX_QUERY_RETRIES, retryQuery } from '../queryRetry';

// A refused refresh token is final: retrying only delays the logout.
test('an expired session is never retried', () => {
  expect(retryQuery(0, new Error('SESSION_EXPIRED'))).toBe(false);
});

test('other failures get two more tries', () => {
  const offline = new Error('Network error');
  expect(MAX_QUERY_RETRIES).toBe(2);
  expect(retryQuery(0, offline)).toBe(true);
  expect(retryQuery(1, offline)).toBe(true);
  expect(retryQuery(2, offline)).toBe(false);
});

test('a failure without a message is retried like any other', () => {
  expect(retryQuery(0, undefined)).toBe(true);
});
