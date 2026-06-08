<?php

namespace App\Http\Controllers;

use App\Models\Reminder;
use App\Models\ReminderDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $reminderIds = Reminder::where('user_id', $request->user()->id)->pluck('id');

        $deliveries = ReminderDelivery::with('reminder')
            ->whereIn('reminder_id', $reminderIds)
            ->where('status', '!=', 'dismissed')
            ->orderByDesc('occurrence_at')
            ->limit(50)
            ->get();

        $unread = $deliveries->whereNull('read_at')->count();

        return response()->json([
            'notifications' => $deliveries->map->toApi()->values(),
            'unread_count' => $unread,
        ]);
    }

    public function read(Request $request, string $deliveryId): JsonResponse
    {
        $delivery = $this->deliveryOr404($request, $deliveryId);
        if (! $delivery->read_at) {
            $delivery->read_at = now();
            $delivery->save();
        }

        return response()->json($delivery->toApi());
    }

    public function snooze(Request $request, string $deliveryId): JsonResponse
    {
        $data = $request->validate([
            'minutes' => 'sometimes|integer|min:1|max:10080',
        ]);
        $minutes = $data['minutes'] ?? 60;

        $delivery = $this->deliveryOr404($request, $deliveryId);
        $delivery->status = 'snoozed';
        $delivery->snoozed_until = now()->addMinutes($minutes);
        $delivery->save();

        // Re-arm the parent reminder to fire again at the snooze time.
        $reminder = $delivery->reminder;
        if ($reminder) {
            $reminder->enabled = true;
            $reminder->last_fired_at = null;
            $reminder->next_fire_at = $delivery->snoozed_until;
            $reminder->save();
        }

        return response()->json($delivery->toApi());
    }

    public function dismiss(Request $request, string $deliveryId): JsonResponse
    {
        $delivery = $this->deliveryOr404($request, $deliveryId);
        $delivery->status = 'dismissed';
        if (! $delivery->read_at) {
            $delivery->read_at = now();
        }
        $delivery->save();

        return response()->json(null, 204);
    }

    private function deliveryOr404(Request $request, string $deliveryId): ReminderDelivery
    {
        $reminderIds = Reminder::where('user_id', $request->user()->id)->pluck('id');

        $delivery = ReminderDelivery::with('reminder')
            ->where('id', $deliveryId)
            ->whereIn('reminder_id', $reminderIds)
            ->first();

        if (! $delivery) {
            abort(404, 'Notification not found');
        }

        return $delivery;
    }
}
