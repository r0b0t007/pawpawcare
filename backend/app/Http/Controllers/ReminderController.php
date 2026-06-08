<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Models\Reminder;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReminderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $reminders = Reminder::where('user_id', $request->user()->id)
            ->orderBy('next_fire_at')
            ->get();

        return response()->json($reminders->map->toApi());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pet_id' => 'sometimes|nullable|string',
            'title' => 'required|string|min:1|max:150',
            'body' => 'sometimes|nullable|string|max:255',
            'schedule_type' => 'required|in:one_time,recurring',
            'fire_at' => 'required_if:schedule_type,one_time|nullable|date',
            'recurrence' => 'required_if:schedule_type,recurring|nullable|in:daily,weekly,monthly',
            'time_of_day' => 'sometimes|nullable|date_format:H:i',
            'lead_time_days' => 'sometimes|nullable|integer|min:0|max:365',
        ]);

        $user = $request->user();

        if (! empty($data['pet_id'])
            && ! Pet::where('id', $data['pet_id'])->where('owner_id', $user->id)->exists()) {
            abort(404, 'Pet not found');
        }

        $isOneTime = $data['schedule_type'] === 'one_time';

        $reminder = new Reminder([
            'user_id' => $user->id,
            'pet_id' => $data['pet_id'] ?? null,
            'type' => 'custom',
            'title' => $data['title'],
            'body' => $data['body'] ?? null,
            'schedule_type' => $data['schedule_type'],
            'fire_at' => $isOneTime && ! empty($data['fire_at']) ? Carbon::parse($data['fire_at'])->utc() : null,
            'recurrence' => $isOneTime ? null : ($data['recurrence'] ?? 'daily'),
            'time_of_day' => $data['time_of_day'] ?? '09:00',
            'lead_time_days' => $data['lead_time_days'] ?? 0,
            'timezone' => $user->timezone ?: 'UTC',
            'enabled' => true,
        ]);
        $reminder->save();

        $reminder->next_fire_at = ReminderScheduler::computeNextFireAt($reminder);
        $reminder->save();

        return response()->json($reminder->toApi(), 201);
    }

    public function update(Request $request, string $reminderId): JsonResponse
    {
        $reminder = $this->reminderOr404($request, $reminderId);

        $data = $request->validate([
            'title' => 'sometimes|string|min:1|max:150',
            'body' => 'sometimes|nullable|string|max:255',
            'time_of_day' => 'sometimes|nullable|date_format:H:i',
            'lead_time_days' => 'sometimes|nullable|integer|min:0|max:365',
            'fire_at' => 'sometimes|nullable|date',
            'recurrence' => 'sometimes|nullable|in:daily,weekly,monthly',
            'enabled' => 'sometimes|boolean',
        ]);

        foreach (['title', 'body', 'time_of_day', 'lead_time_days', 'recurrence'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $reminder->{$field} = $data[$field];
            }
        }
        if (array_key_exists('fire_at', $data) && $data['fire_at'] !== null) {
            $reminder->fire_at = Carbon::parse($data['fire_at'])->utc();
        }
        if (array_key_exists('enabled', $data)) {
            $reminder->enabled = $data['enabled'];
            // Re-arm a one-time reminder that's being re-enabled.
            if ($data['enabled']) {
                $reminder->last_fired_at = null;
            }
        }

        $reminder->next_fire_at = ReminderScheduler::computeNextFireAt($reminder);
        $reminder->save();

        return response()->json($reminder->toApi());
    }

    public function destroy(Request $request, string $reminderId): JsonResponse
    {
        $this->reminderOr404($request, $reminderId)->delete();

        return response()->json(null, 204);
    }

    private function reminderOr404(Request $request, string $reminderId): Reminder
    {
        $reminder = Reminder::where('id', $reminderId)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $reminder) {
            abort(404, 'Reminder not found');
        }

        return $reminder;
    }
}
