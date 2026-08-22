<?php

namespace App\Http\Controllers;

use App\Models\CareStreak;
use App\Models\Milestone;
use App\Models\Pet;
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
}
