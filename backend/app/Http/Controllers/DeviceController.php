<?php

namespace App\Http\Controllers;

use App\Models\DeviceToken;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string|max:255',
            'platform' => 'sometimes|nullable|string|max:10',
            'timezone' => 'sometimes|nullable|string|max:64',
        ]);

        $user = $request->user();
        $tz = $this->safeTimezone($data['timezone'] ?? null);

        DeviceToken::updateOrCreate(
            ['token' => $data['token']],
            [
                'user_id' => $user->id,
                'platform' => $data['platform'] ?? null,
                'timezone' => $tz,
                'prefers_local' => true,
                'last_seen_at' => now(),
            ],
        );

        // Keep the user's default timezone fresh so reminders compute correctly,
        // and re-pin any existing reminders to the new zone.
        if (! empty($data['timezone']) && $user->timezone !== $tz) {
            $user->timezone = $tz;
            $user->save();
            ReminderScheduler::recomputeForUser($user);
        }

        return response()->json(['status' => 'ok']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => 'required|string']);

        DeviceToken::where('token', $data['token'])
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(null, 204);
    }

    private function safeTimezone(?string $tz): string
    {
        return ($tz && in_array($tz, timezone_identifiers_list(), true)) ? $tz : 'UTC';
    }
}
