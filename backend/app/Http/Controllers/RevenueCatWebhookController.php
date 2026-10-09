<?php

namespace App\Http\Controllers;

use App\Models\RevenueCatEvent;
use App\Services\Subscriptions\EntitlementWriter;
use App\Support\ReportOnce;
use App\Support\SentryScrubber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * POST /webhooks/revenuecat — RevenueCat's server-to-server notifications.
 *
 * Authenticated by the shared secret RevenueCat sends verbatim in the
 * Authorization header (configured on both sides). Fails closed: without a
 * configured secret (or with one too short to be safe) every request is
 * refused. Every event is recorded in the revenuecat_events ledger first
 * (idempotency — retries reuse the event id), then applied. A failure while
 * applying returns 500 so RevenueCat redelivers it; the ledger makes those
 * retries safe.
 */
class RevenueCatWebhookController extends Controller
{
    /** A guessable shared secret would let anyone grant entitlements. */
    public const MIN_SECRET_LENGTH = 32;

    /**
     * The only event fields kept in the ledger: what applying and auditing an
     * event needs. Everything else RevenueCat sends (subscriber attributes
     * with the email, country, price, store transaction ids, fields added in
     * future) is dropped.
     */
    private const STORED_FIELDS = [
        'id', 'type', 'event_timestamp_ms', 'environment', 'store', 'period_type',
        'product_id', 'new_product_id', 'entitlement_ids', 'entitlement_id', 'expiration_at_ms',
        'app_user_id', 'original_app_user_id', 'aliases', 'transferred_from', 'transferred_to',
        'cancel_reason', 'expiration_reason',
    ];

    public function handle(Request $request, EntitlementWriter $writer): JsonResponse
    {
        $secret = (string) config('services.revenuecat.webhook_auth');
        if ($secret === '') {
            abort(503, 'Subscriptions are not configured');
        }
        if (strlen($secret) < self::MIN_SECRET_LENGTH) {
            ReportOnce::log('revenuecat-webhook:weak-secret', 'critical',
                'REVENUECAT_WEBHOOK_AUTH is shorter than '.self::MIN_SECRET_LENGTH.' characters; the webhook refuses all events until it is a long random value.');
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

        $payload = Arr::only($event, self::STORED_FIELDS);

        RevenueCatEvent::query()->insertOrIgnore([
            'id' => $data['event']['id'],
            'type' => $data['event']['type'],
            'environment' => $data['event']['environment'] ?? null,
            'event_timestamp_ms' => $data['event']['event_timestamp_ms'],
            'payload' => json_encode($payload),
            'received_at' => now(),
            'attempts' => 0,
        ]);

        try {
            // Locks the ledger row: concurrent deliveries of the same event are
            // applied once (the second sees it processed → duplicate). If the
            // insert above was silently dropped (INSERT IGNORE also swallows
            // data errors), process() throws and RevenueCat retries.
            $status = $writer->process($data['event']['id']);
        } catch (\Throwable $e) {
            report($e);
            try {
                RevenueCatEvent::whereKey($data['event']['id'])->update([
                    'status' => 'failed',
                    'attempts' => DB::raw('attempts + 1'),
                    'error' => mb_strcut(SentryScrubber::scrubText(class_basename($e).': '.$e->getMessage()), 0, 255),
                ]);
            } catch (\Throwable $inner) {
                Log::warning('Could not record a RevenueCat event failure', ['event_id' => $data['event']['id']]);
            }

            // Non-2xx: RevenueCat redelivers; the ledger keeps that idempotent.
            return response()->json(['status' => 'retry'], 500);
        }

        return response()->json(['status' => $status]);
    }
}
