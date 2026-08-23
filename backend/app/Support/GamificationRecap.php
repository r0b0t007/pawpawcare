<?php

namespace App\Support;

use App\Models\CareStreak;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Trailing-7-day care recap for a set of pets — shared by the Sunday recap
 * push (SendEngagementPushes) and GET /gamification/recap, so the app and the
 * notification can never disagree about the same week.
 *
 * A rolling window (not ISO weeks) keeps the recap meaningful whether it is
 * read on Sunday evening or Monday morning — no week-boundary cliff.
 *
 * PRECONDITION: callers must pass ids already scoped via Pet::accessibleBy —
 * this helper performs no authorization of its own. Never feed it request
 * input directly.
 */
class GamificationRecap
{
    public static function forPets(Collection $petIds): array
    {
        $since = CarbonImmutable::now()->subDays(7);
        $sinceStr = $since->toDateTimeString();

        $doses = DB::table('medication_logs')
            ->join('medications', 'medications.id', '=', 'medication_logs.medication_id')
            ->whereIn('medications.pet_id', $petIds)
            ->where('medication_logs.administered_at', '>=', $sinceStr)
            ->where('medication_logs.administered_at', '<=', now())
            ->selectRaw('medications.pet_id, count(*) as n')
            ->groupBy('medications.pet_id')->pluck('n', 'pet_id');

        $weights = DB::table('weight_logs')->whereIn('pet_id', $petIds)
            ->where('logged_at', '>=', $since->toDateString())
            ->where('logged_at', '<=', now()->toDateString())
            ->selectRaw('pet_id, count(*) as n')
            ->groupBy('pet_id')->pluck('n', 'pet_id');

        $activities = DB::table('activities')->whereIn('pet_id', $petIds)
            ->whereBetween('created_at', [$sinceStr, now()->toDateTimeString()])
            ->selectRaw('pet_id, count(*) as n')
            ->groupBy('pet_id')->pluck('n', 'pet_id');

        $overdue = DB::table('vaccinations')->whereIn('pet_id', $petIds)
            ->where('status', 'overdue')
            ->selectRaw('pet_id, count(*) as n')
            ->groupBy('pet_id')->pluck('n', 'pet_id');

        $streaks = CareStreak::whereIn('pet_id', $petIds)->pluck('current_weeks', 'pet_id');

        return [
            'since' => $since->toDateString(),
            'per_pet' => $petIds->map(fn ($id) => [
                'pet_id' => $id,
                'doses' => (int) ($doses[$id] ?? 0),
                'weights' => (int) ($weights[$id] ?? 0),
                'activities' => (int) ($activities[$id] ?? 0),
                'vax_current' => (int) ($overdue[$id] ?? 0) === 0,
                'current_weeks' => (int) ($streaks[$id] ?? 0),
            ])->values()->all(),
        ];
    }
}
