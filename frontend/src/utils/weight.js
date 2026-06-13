// Pure weight helpers, extracted from PetProfileScreen so the trend math is
// unit-testable. `weightInsight` mirrors the backend App\Support\WeightInsight
// — keep the 3% / 10% thresholds and the span humanizer in sync.

const KG_PER_LB = 0.45359237;

// Convert a logged weight to the pet's current display unit so the chart/trend
// never mix kg and lbs (even if the pet's unit changed after some logs).
export const convertWeight = (value, from, to) => {
  const n = Number(value) || 0;
  if (!from || from === to) return n;
  if (from === 'kg' && to === 'lbs') return n / KG_PER_LB;
  if (from === 'lbs' && to === 'kg') return n * KG_PER_LB;
  return n;
};

const WEIGHT_STABLE_PCT = 3.0;
const WEIGHT_NOTABLE_PCT = 10.0;

// Plain-language weight trend over the full history — direction, magnitude,
// span, and a non-diagnostic "notable change" flag. `points` are already
// normalized to the pet's display unit ({ loggedAt, value }); null under 2 logs.
export const weightInsight = (points, unit) => {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => new Date(a.loggedAt) - new Date(b.loggedAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const changeAbs = Math.round((last.value - first.value) * 100) / 100;
  const changePct = first.value > 0 ? Math.round((changeAbs / first.value) * 1000) / 10 : 0;
  const days = Math.max(1, Math.round((new Date(last.loggedAt) - new Date(first.loggedAt)) / 86400000));
  const direction = Math.abs(changePct) < WEIGHT_STABLE_PCT ? 'stable' : changeAbs > 0 ? 'up' : 'down';
  const span = days < 14 ? `${days} day${days === 1 ? '' : 's'}`
    : days < 60 ? `${Math.round(days / 7)} weeks`
      : `${Math.round(days / 30)} months`;
  const mag = Math.abs(changeAbs).toFixed(1).replace(/\.0$/, '');
  const summary = direction === 'stable'
    ? `Stable over the last ${span}`
    // "Down" already conveys the sign — show the percent unsigned.
    : `${direction === 'up' ? 'Up' : 'Down'} ${mag} ${unit} (${Math.abs(changePct)}%) over the last ${span}`;
  return { current: last.value, changeAbs, changePct, days, direction, notable: Math.abs(changePct) >= WEIGHT_NOTABLE_PCT, summary };
};
