import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { gamificationKeys } from './queryKeys';

// Weekly care streaks + milestone badges, nightly-computed server-side.
// Read-only domain: there are no client writes, so nothing lives in
// DataContext — completion mutations there invalidate gamificationKeys so a
// fresh summary lands after the next nightly rollup.
//
// Shapes (snake_case, from GET /gamification/summary):
//   streaks:    [{ pet_id, current_weeks, longest_weeks, last_qualifying_week_start }]
//   milestones: [{ id, pet_id, key, earned_at }]
async function fetchSummary() {
  const data = await get('/gamification/summary');
  return {
    streaks: data.streaks || [],
    milestones: data.milestones || [],
  };
}

// The summary changes once a night, and DataContext mutations that can move it
// invalidate gamificationKeys (which refetches regardless of staleTime), so an
// hour of freshness only skips redundant refetches on screen focus.
const SUMMARY_STALE_MS = 60 * 60 * 1000;

export function useGamificationSummary() {
  return useQuery({
    queryKey: gamificationKeys.summary,
    queryFn: fetchSummary,
    staleTime: SUMMARY_STALE_MS,
  });
}

// Trailing-7-day recap ({ since, per_pet: [{ pet_id, doses, weights,
// activities, vax_current, current_weeks }] }). Fetched only when `enabled` —
// the Dashboard shows it around the week boundary (Sun–Mon), so there is no
// point requesting it midweek.
export function useGamificationRecap(enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.recap,
    queryFn: () => get('/gamification/recap'),
    enabled,
  });
}

// Human copy for milestone keys. Falls back to null for unknown keys so a
// newer server never renders raw identifiers in the UI.
const MILESTONE_LABELS = {
  first_record: 'First health record',
  records_10: '10 health records',
  records_25: '25 health records',
  records_100: '100 health records',
  weights_5: '5 weight entries',
  weights_20: '20 weight entries',
  weights_50: '50 weight entries',
  vax_complete: 'Vaccinations all caught up',
};

export function milestoneLabel(key) {
  if (MILESTONE_LABELS[key]) return MILESTONE_LABELS[key];
  const anniversary = /^anniversary_(\d+)$/.exec(key || '');
  if (anniversary) {
    const n = Number(anniversary[1]);
    return `${n} year${n === 1 ? '' : 's'} together`;
  }
  return null;
}
