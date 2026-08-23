<?php

namespace App\Http\Controllers;

use App\Models\CareStreak;
use App\Models\Milestone;
use App\Models\Pet;
use App\Support\GamificationRecap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GamificationController extends Controller
{
    /**
     * Streaks + milestones for every pet the user can access. Family members
     * see shared pets' streaks by design — the streak is the pet's, and any
     * caretaker's logged care counts toward it.
     */
    public function summary(Request $request): JsonResponse
    {
        $petIds = Pet::accessibleBy($request->user()->id)->pluck('id');

        return response()->json([
            'streaks' => CareStreak::whereIn('pet_id', $petIds)
                ->get()->map->toApi()->values(),
            'milestones' => Milestone::whereIn('pet_id', $petIds)
                ->orderBy('earned_at')->get()->map->toApi()->values(),
        ]);
    }

    /**
     * Trailing-7-day care recap for the user's accessible pets — the same
     * computation the Sunday recap push summarizes (App\Support\GamificationRecap),
     * so the in-app card and the notification always agree.
     */
    public function recap(Request $request): JsonResponse
    {
        $petIds = Pet::accessibleBy($request->user()->id)->pluck('id');

        return response()->json(GamificationRecap::forPets($petIds));
    }
}
