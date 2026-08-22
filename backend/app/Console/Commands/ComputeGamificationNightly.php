<?php

namespace App\Console\Commands;

use App\Models\CareStreak;
use App\Models\Milestone;
use App\Models\Pet;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Nightly gamification pass: recompute each pet's weekly care streak and award
 * any newly-reached milestones.
 *
 * Honest-gamification contract: everything here derives from append-only care
 * records the user (or their family) actually created — never app-opens. The
 * care_streaks table is a pure cache (recomputed from scratch each run, so a
 * missed night or a backfilled record self-heals); milestones are append-only
 * and never revoked.
 */
class ComputeGamificationNightly extends Command
{
    protected $signature = 'gamification:nightly';

    protected $description = 'Recompute per-pet weekly care streaks and award new milestones.';

    /** Ignore care records older than this when rebuilding streaks (weeks). */
    private const LOOKBACK_WEEKS = 160;

    private const RECORD_MILESTONES = ['first_record' => 1, 'records_10' => 10, 'records_25' => 25, 'records_100' => 100];

    private const WEIGHT_MILESTONES = ['weights_5' => 5, 'weights_20' => 20, 'weights_50' => 50];

    private const MAX_ANNIVERSARY_YEARS = 25;

    // Scale note: ~12 queries per pet per night. Fine at consumer scale;
    // past ~10k pets, batch the six signals into grouped queries instead.
    public function handle(): int
    {
        $processed = 0;

        Pet::query()->chunkById(200, function ($pets) use (&$processed) {
            foreach ($pets as $pet) {
                $this->rollStreak($pet);
                $this->awardMilestones($pet);
                $processed++;
            }
        });

        $this->info("Processed {$processed} pets.");

        return self::SUCCESS;
    }

    /**
     * The six care signals, as [table date-expression, query] pairs scoped to
     * one pet. Weekly granularity is deliberately forgiving, so the app
     * timezone (UTC) is fine for bucketing.
     */
    private function careDates(Pet $pet): array
    {
        $floor = CarbonImmutable::now()->subWeeks(self::LOOKBACK_WEEKS)->toDateString();
        // Upper bound (security review): future-dated records must never enter
        // the streak window — a future dose log would otherwise inflate
        // longest_weeks AND force current_weeks to 0 for the whole family
        // until that date arrives (the "latest week" would not be this week).
        $ceil = CarbonImmutable::now()->endOfDay()->toDateTimeString();

        $dates = [];

        // medication_logs has no pet_id — join through medications.
        $dates[] = DB::table('medication_logs')
            ->join('medications', 'medications.id', '=', 'medication_logs.medication_id')
            ->where('medications.pet_id', $pet->id)
            ->whereBetween('medication_logs.administered_at', [$floor, $ceil])
            ->pluck('medication_logs.administered_at');

        $dates[] = $pet->weightLogs()->whereBetween('logged_at', [$floor, $ceil])->pluck('logged_at');
        $dates[] = $pet->activities()->whereBetween('created_at', [$floor, $ceil])->pluck('created_at');
        $dates[] = $pet->vaccinations()->where('status', 'completed')
            ->whereNotNull('administered_date')->whereBetween('administered_date', [$floor, $ceil])
            ->pluck('administered_date');
        $dates[] = $pet->appointments()->where('status', 'completed')
            ->whereBetween('scheduled_at', [$floor, $ceil])->pluck('scheduled_at');
        $dates[] = $pet->documents()->whereBetween('created_at', [$floor, $ceil])->pluck('created_at');

        return collect($dates)->flatten()->filter()->all();
    }

    private function rollStreak(Pet $pet): void
    {
        // Bucket every care action into its ISO week (Monday start).
        $weeks = collect($this->careDates($pet))
            ->map(fn ($d) => CarbonImmutable::parse($d)->startOfWeek(CarbonImmutable::MONDAY)->toDateString())
            ->unique()
            ->sort()
            ->values();

        if ($weeks->isEmpty()) {
            // No care history in the window: reset the cache row if one exists
            // (recompute semantics — never leave a stale streak standing).
            CareStreak::where('pet_id', $pet->id)->update([
                'current_weeks' => 0, 'longest_weeks' => 0, 'last_qualifying_week_start' => null,
            ]);

            return;
        }

        // Longest consecutive-week run, walking the sorted unique week starts.
        $longest = 1;
        $run = 1;
        for ($i = 1; $i < $weeks->count(); $i++) {
            $prev = CarbonImmutable::parse($weeks[$i - 1]);
            $run = $prev->addWeek()->toDateString() === $weeks[$i] ? $run + 1 : 1;
            $longest = max($longest, $run);
        }

        // The current streak is alive if its last qualifying week is this week
        // OR last week — the running week isn't over, so a quiet Tuesday must
        // not read as a broken streak (same grace rule as the daily med streak).
        $thisWeek = CarbonImmutable::now()->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
        $lastWeek = CarbonImmutable::now()->subWeek()->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
        $latest = $weeks->last();
        $current = in_array($latest, [$thisWeek, $lastWeek], true) ? $run : 0;

        CareStreak::updateOrCreate(
            ['pet_id' => $pet->id],
            ['current_weeks' => $current, 'longest_weeks' => $longest, 'last_qualifying_week_start' => $latest],
        );
    }

    private function awardMilestones(Pet $pet): void
    {
        $now = now();

        // Total care records across the same six signals (unbounded — counts
        // are cheap and milestones should honor the full history).
        $medLogs = DB::table('medication_logs')
            ->join('medications', 'medications.id', '=', 'medication_logs.medication_id')
            ->where('medications.pet_id', $pet->id)->count();
        $weights = $pet->weightLogs()->count();
        $total = $medLogs + $weights
            + $pet->activities()->count()
            + $pet->vaccinations()->where('status', 'completed')->count()
            + $pet->appointments()->where('status', 'completed')->count()
            + $pet->documents()->count();

        foreach (self::RECORD_MILESTONES as $key => $threshold) {
            if ($total >= $threshold) {
                Milestone::firstOrCreate(['pet_id' => $pet->id, 'key' => $key], ['earned_at' => $now, 'created_at' => $now]);
            }
        }

        foreach (self::WEIGHT_MILESTONES as $key => $threshold) {
            if ($weights >= $threshold) {
                Milestone::firstOrCreate(['pet_id' => $pet->id, 'key' => $key], ['earned_at' => $now, 'created_at' => $now]);
            }
        }

        // Every recorded vaccination completed (and at least one exists).
        $vaxTotal = $pet->vaccinations()->count();
        if ($vaxTotal > 0 && $pet->vaccinations()->where('status', '!=', 'completed')->count() === 0) {
            Milestone::firstOrCreate(['pet_id' => $pet->id, 'key' => 'vax_complete'], ['earned_at' => $now, 'created_at' => $now]);
        }

        // Care anniversaries — only from the real gotcha day, never faked from
        // created_at. earned_at is the anniversary itself, not tonight.
        if ($pet->adopted_on) {
            $years = (int) $pet->adopted_on->diffInYears($now);
            for ($n = 1; $n <= min($years, self::MAX_ANNIVERSARY_YEARS); $n++) {
                Milestone::firstOrCreate(
                    ['pet_id' => $pet->id, 'key' => "anniversary_{$n}"],
                    ['earned_at' => $pet->adopted_on->copy()->addYears($n)->startOfDay(), 'created_at' => $now],
                );
            }
        }
    }
}
