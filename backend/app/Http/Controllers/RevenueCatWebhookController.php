<?php

namespace App\Http\Controllers;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Services\Subscriptions\EntitlementWriter;
use App\Support\ReportOnce;
use App\Support\SentryScrubber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

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
 *
 * Customer identifiers never enter the ledger payload: the ids that are our
 * users are recorded in revenuecat_event_users (foreign keys, so deleting an
 * account erases the link), and any other id is simply not stored.
 */
class RevenueCatWebhookController extends Controller
{
    /** A guessable shared secret would let anyone grant entitlements. */
    public const MIN_SECRET_LENGTH = 32;

    /**
     * The only event fields kept in the ledger payload. No customer ids, and
     * nothing else RevenueCat sends (subscriber attributes with the email,
     * country, price, store transaction ids, fields added in future).
     */
    private const STORED_FIELDS = [
        'id', 'type', 'event_timestamp_ms', 'environment', 'store', 'period_type',
        'product_id', 'new_product_id', 'entitlement_ids', 'entitlement_id',
        'expiration_at_ms', 'grace_period_expiration_at_ms', 'cancel_reason', 'expiration_reason',
    ];

    /** Customer-id fields → the role recorded for ids that are our users. */
    private const IDENTITY_ROLES = [
        'app_user_id' => 'app_user',
        'original_app_user_id' => 'original',
        'aliases' => 'alias',
        'transferred_to' => 'transfer_to',
        'transferred_from' => 'transfer_from',
    ];

    public function handle(Request $request, EntitlementWriter $writer): JsonResponse
    {
        // Every message here stays English, not __(): the reader is
        // RevenueCat's delivery log (server to server), never an app user.
        //
        // Plain responses (not abort()): an unconfigured webhook is an
        // expected state, not an error to report for every scanner request.
        $secret = (string) config('services.revenuecat.webhook_auth');
        if ($secret === '') {
            if (app()->environment('production')) {
                ReportOnce::log('revenuecat-webhook:unset', 'error', 'REVENUECAT_WEBHOOK_AUTH is not set; RevenueCat webhook events are being refused.', 86400);
            }

            return response()->json(['detail' => 'Subscriptions are not configured'], 503);
        }
        if (strlen($secret) < self::MIN_SECRET_LENGTH) {
            ReportOnce::log('revenuecat-webhook:weak-secret', 'critical',
                'REVENUECAT_WEBHOOK_AUTH is shorter than '.self::MIN_SECRET_LENGTH.' characters; the webhook refuses all events until it is a long random value.');

            return response()->json(['detail' => 'Subscriptions are not configured'], 503);
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
        $eventId = $data['event']['id'];

        try {
            DB::transaction(function () use ($event, $data, $eventId) {
                RevenueCatEvent::query()->insertOrIgnore([
                    'id' => $eventId,
                    'type' => $data['event']['type'],
                    'environment' => $data['event']['environment'] ?? null,
                    'event_timestamp_ms' => $data['event']['event_timestamp_ms'],
                    'payload' => json_encode(Arr::only($event, self::STORED_FIELDS)),
                    'received_at' => now(),
                ]);
                // A user being purged: InnoDB makes this wait for the purge,
                // then INSERT IGNORE drops the link (FK error → warning). On
                // SQLite (tests) the FK error throws → 500 → retry stores none.
                DB::table('revenuecat_event_users')->insertOrIgnore($this->userLinks($eventId, $event));
            });

            // Locks the ledger row: concurrent deliveries of the same event are
            // applied once (the second sees it processed → duplicate). If the
            // insert above was silently dropped (INSERT IGNORE also swallows
            // data errors), process() throws and RevenueCat retries.
            $status = $writer->process($eventId);
        } catch (\Throwable $e) {
            report($e);
            try {
                RevenueCatEvent::whereKey($eventId)->update([
                    'status' => 'failed',
                    'attempts' => DB::raw('attempts + 1'),
                    'error' => mb_strcut(SentryScrubber::scrubText(class_basename($e).': '.$e->getMessage()), 0, 255),
                ]);
            } catch (\Throwable $inner) {
                Log::warning('Could not record a RevenueCat event failure', ['event_id' => $eventId]);
            }

            // Non-2xx: RevenueCat redelivers; the ledger keeps that idempotent.
            return response()->json(['status' => 'retry'], 500);
        }

        return response()->json(['status' => $status]);
    }

    /** Link rows for every id in the event that is one of our users. */
    private function userLinks(string $eventId, array $event): array
    {
        $byRole = [];
        foreach (self::IDENTITY_ROLES as $field => $role) {
            // Transfer ids only identify anyone on a TRANSFER event.
            if (str_starts_with($field, 'transferred_') && ($event['type'] ?? null) !== 'TRANSFER') {
                continue;
            }
            foreach ((array) ($event[$field] ?? []) as $id) {
                if (is_string($id) && Str::isUuid($id)) {
                    $byRole[$role][] = strtolower($id);
                }
            }
        }
        if ($byRole === []) {
            return [];
        }

        $existing = User::whereIn('id', array_unique(array_merge(...array_values($byRole))))
            ->pluck('id')
            ->map(fn ($id) => strtolower((string) $id))
            ->all();
        $links = [];
        foreach ($byRole as $role => $ids) {
            foreach (array_unique(array_intersect($ids, $existing)) as $id) {
                $links[] = ['event_id' => $eventId, 'user_id' => $id, 'role' => $role];
            }
        }

        return $links;
    }
}
