<?php

namespace App\Http\Controllers;

use App\Models\RevenueCatEvent;
use App\Services\Subscriptions\EntitlementWriter;
use App\Support\ReportOnce;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

/**
 * POST /webhooks/revenuecat — RevenueCat's server-to-server notifications.
 *
 * Authenticated by the shared secret RevenueCat sends verbatim in the
 * Authorization header (configured on both sides). Fails closed: without a
 * configured secret every request is refused. Every event is recorded in the
 * revenuecat_events ledger first (idempotency — retries reuse the event id),
 * then applied. A failure while applying still returns 200: the ledger row
 * stays unprocessed and the reconcile job retries it, rather than RevenueCat
 * retrying on its own schedule.
 */
class RevenueCatWebhookController extends Controller
{
    public function handle(Request $request, EntitlementWriter $writer): JsonResponse
    {
        $secret = (string) config('services.revenuecat.webhook_auth');
        if ($secret === '') {
            abort(503, 'Subscriptions are not configured');
        }
        if (! hash_equals($secret, (string) $request->header('Authorization'))) {
            ReportOnce::log('revenuecat-webhook:bad-auth', 'warning', 'RevenueCat webhook rejected: wrong Authorization header');
            abort(401, 'Unauthorized');
        }

        $data = $request->validate([
            'event' => 'required|array',
            'event.id' => 'required|string|max:100',
            'event.type' => 'required|string|max:40',
            'event.event_timestamp_ms' => 'required|integer|min:0',
            'event.environment' => 'sometimes|nullable|string|max:16',
        ]);
        $event = $request->input('event');

        // Never persist subscriber attributes: they can carry the email and
        // other profile data RevenueCat collected.
        $payload = Arr::except($event, ['subscriber_attributes']);

        $inserted = RevenueCatEvent::query()->insertOrIgnore([
            'id' => $data['event']['id'],
            'type' => $data['event']['type'],
            'environment' => $data['event']['environment'] ?? null,
            'event_timestamp_ms' => $data['event']['event_timestamp_ms'],
            'payload' => json_encode($payload),
            'received_at' => now(),
            'attempts' => 0,
        ]);

        $row = RevenueCatEvent::find($data['event']['id']);
        if (! $inserted && $row->processed_at !== null) {
            return response()->json(['status' => 'duplicate']);
        }

        try {
            $status = $writer->process($row);
        } catch (\Throwable $e) {
            report($e);
            $row->forceFill(['error' => substr(class_basename($e).': '.$e->getMessage(), 0, 255)])->save();

            return response()->json(['status' => 'queued_for_retry']);
        }

        return response()->json(['status' => $status]);
    }
}
