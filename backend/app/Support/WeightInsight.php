<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Turns a pet's raw weight logs into a plain-language trend insight —
 * direction, magnitude, and span over the full history — plus a non-diagnostic
 * "worth a vet check" flag for notable swings.
 *
 * The app mirrors this logic client-side for an instant render; this server
 * copy is the tested source of truth and powers the vet share page. Keep the
 * STABLE/NOTABLE thresholds in sync with the frontend's weightInsight().
 */
class WeightInsight
{
    /** Below this % change over the window, weight is "stable" (noise). */
    private const STABLE_PCT = 3.0;

    /** At/above this % change, flag it as worth raising with a vet. */
    private const NOTABLE_PCT = 10.0;

    private const KG_PER_LB = 0.45359237;

    /**
     * @param  iterable  $logs  WeightLog-like rows (->weight, ->unit, ->logged_at Carbon)
     * @param  string  $unit  the pet's current display unit; logs are converted to it
     * @return array<string, mixed>|null null when there are fewer than two logs
     */
    public static function for(iterable $logs, string $unit): ?array
    {
        $points = collect($logs)
            ->map(fn ($l) => [
                'w' => self::toUnit((float) $l->weight, $l->unit, $unit),
                'at' => $l->logged_at instanceof Carbon ? $l->logged_at : Carbon::parse($l->logged_at),
            ])
            ->sortBy(fn ($p) => $p['at']->timestamp)
            ->values();

        if ($points->count() < 2) {
            return null;
        }

        $first = $points->first();
        $last = $points->last();
        $changeAbs = round($last['w'] - $first['w'], 2);
        $changePct = $first['w'] > 0 ? round($changeAbs / $first['w'] * 100, 1) : 0.0;
        $days = (int) $first['at']->diffInDays($last['at']);

        $direction = abs($changePct) < self::STABLE_PCT ? 'stable' : ($changeAbs > 0 ? 'up' : 'down');

        return [
            'current' => round($last['w'], 1),
            'unit' => $unit,
            'direction' => $direction,
            'change_abs' => $changeAbs,
            'change_pct' => $changePct,
            'period_days' => $days,
            'points' => $points->count(),
            'notable' => abs($changePct) >= self::NOTABLE_PCT,
            'summary' => self::summary($direction, $changeAbs, $changePct, $days, $unit),
        ];
    }

    private static function summary(string $dir, float $abs, float $pct, int $days, string $unit): string
    {
        $span = self::humanizeSpan($days);

        if ($dir === 'stable') {
            return "Stable over the last {$span}";
        }

        $word = $dir === 'up' ? 'Up' : 'Down';
        $mag = rtrim(rtrim(number_format(abs($abs), 1), '0'), '.');
        // "Down" already conveys the sign — show the magnitude unsigned.
        $pctMag = rtrim(rtrim(number_format(abs($pct), 1), '0'), '.');

        return "{$word} {$mag} {$unit} ({$pctMag}%) over the last {$span}";
    }

    private static function humanizeSpan(int $days): string
    {
        if ($days < 14) {
            return max($days, 1).' day'.($days === 1 ? '' : 's');
        }
        if ($days < 60) {
            $w = (int) round($days / 7);

            return "{$w} weeks";
        }
        $m = (int) round($days / 30);

        return "{$m} months";
    }

    private static function toUnit(float $value, ?string $from, string $to): float
    {
        $from = self::canon($from);
        $to = self::canon($to);
        if ($from === $to) {
            return $value;
        }

        return $from === 'kg' ? $value / self::KG_PER_LB : $value * self::KG_PER_LB;
    }

    /** Collapse 'lb'/'lbs'/'pound' to 'lb', everything else to 'kg'. */
    private static function canon(?string $unit): string
    {
        return str_starts_with(strtolower((string) $unit), 'lb') ? 'lb' : 'kg';
    }
}
