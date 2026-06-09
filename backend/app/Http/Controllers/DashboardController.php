<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\ReminderDelivery;
use App\Models\Vaccination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $pets = Pet::accessibleBy($request->user()->id)->get();
        $petIds = $pets->pluck('id');

        $today = Carbon::today();
        $thirtyDays = $today->clone()->addDays(30);

        $upcomingVax = collect();
        $recentActivities = collect();
        $overdueCount = 0;
        $upcomingCount = 0;

        if ($petIds->isNotEmpty()) {
            $vaccinations = Vaccination::whereIn('pet_id', $petIds)
                ->where('status', '!=', 'completed')
                ->orderBy('due_date')
                ->get();

            foreach ($vaccinations as $vax) {
                if ($vax->due_date->lt($today)) {
                    $vax->status = 'overdue';
                    $overdueCount++;
                } elseif ($vax->due_date->lte($thirtyDays)) {
                    $upcomingCount++;
                }
                if ($vax->due_date->lte($thirtyDays)) {
                    $upcomingVax->push($vax);
                }
            }

            $recentActivities = Activity::whereIn('pet_id', $petIds)
                ->orderByDesc('created_at')
                ->limit(10)
                ->get();
        }

        $reminderIds = Reminder::where('user_id', $request->user()->id)->pluck('id');
        $unreadNotifications = $reminderIds->isEmpty() ? 0 : ReminderDelivery::whereIn('reminder_id', $reminderIds)
            ->whereNull('read_at')
            ->where('status', '!=', 'dismissed')
            ->count();

        return response()->json([
            'pets' => $pets->map->toApi()->values(),
            'upcoming_vaccinations' => $upcomingVax->map->toApi()->values(),
            'recent_activities' => $recentActivities->map->toApi()->values(),
            'total_pets' => $pets->count(),
            'overdue_vaccinations' => $overdueCount,
            'upcoming_vaccinations_count' => $upcomingCount,
            'unread_notifications' => $unreadNotifications,
        ]);
    }
}
