import { useCallback, useRef, useState } from 'react';

// One tap, one request: `run(key, fn)` ignores a second call for the same key
// while the first is in flight (a synchronous ref, so two taps in one frame
// can't both get through), and `isBusy(key)` lets the button show it.
export function useInFlight() {
  const pending = useRef(new Set());
  const [busy, setBusy] = useState([]);

  const run = useCallback(async (key, fn) => {
    if (pending.current.has(key)) return undefined;
    pending.current.add(key);
    setBusy((keys) => [...keys, key]);
    try {
      return await fn();
    } finally {
      pending.current.delete(key);
      setBusy((keys) => keys.filter((k) => k !== key));
    }
  }, []);

  const isBusy = useCallback((key) => busy.includes(key), [busy]);

  return { run, isBusy };
}
