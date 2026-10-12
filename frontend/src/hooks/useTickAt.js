import { useEffect, useState } from 'react';

// setTimeout's ceiling (~24.8 days); a later time just re-arms on the next tick.
const MAX_DELAY = 2147483647;

// Re-render when the earliest future time in `times` (ms epochs) passes, and
// return a counter to put in a memo's deps — so a screen that stays mounted
// drops "already happened" items (a fired reminder) on time instead of only
// when its data next changes.
export function useTickAt(times) {
  const [tick, setTick] = useState(0);
  const now = Date.now();
  const next = times.reduce((min, t) => (t > now && t < min ? t : min), Infinity);

  useEffect(() => {
    if (!Number.isFinite(next)) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(next - Date.now() + 1000, MAX_DELAY));
    return () => clearTimeout(timer);
  }, [next, tick]);

  return tick;
}
