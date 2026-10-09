<?php

namespace App\Services\Subscriptions;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Applies RevenueCat webhook events (stored in the revenuecat_events ledger)
 * to user_entitlements. The only writer of entitlement state besides the API
 * sync (D2). Nothing is gated on it yet.
 *
 * - Users are resolved from app_user_id / original_app_user_id / aliases;
 *   only our own UUIDs count (anonymous "$RCAnonymousID:…" ids are ignored).
 * - Each event type changes only what it means (a support extension doesn't
 *   turn auto-renew back on; an uncancellation doesn't clear a billing issue).
 * - Ordering: an event older than the last one applied is skipped; a
 *   different event with the SAME timestamp is ambiguous and left to the sync.
 * - Plan changes (PRODUCT_CHANGE), TRANSFER and unrecognised types are left to
 *   the API sync (needs_sync): the payload alone can't say what's in effect.
 * - Sandbox events are recorded too (App Review buys in sandbox); whether
 *   they count is decided where entitlements are read (D2).
 */
class EntitlementWriter
{
    public const APPLIED = 'applied';

    public const STALE = 'stale';

    public const IGNORED = 'ignored';

    public const DUPLICATE = 'duplicate';

    public const UNKNOWN_USER = 'unknown_user';

    public const NEEDS_SYNC = 'needs_sync';

    /** Event types this writer applies, mapped to the state each one sets. */
    private const APPLIED_TYPES = [
        'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE',
        'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED',
        'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED',
    ];

    /** Types that set the product (a new purchase or its renewal). */
    private const SETS_PRODUCT = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'];

    /** Acknowledged without changing anything. */
    private const INFORMATIONAL = ['TEST', 'INVOICE_ISSUANCE', 'VIRTUAL_CURRENCY_TRANSACTION', 'EXPERIMENT_ENROLLMENT'];

    /** Fields that identify the customer — dropped when they match no user. */
    private const IDENTITY_FIELDS = ['app_user_id', 'original_app_user_id', 'aliases', 'transferred_from', 'transferred_to'];

    /** Server analytics event name per RevenueCat type. */
    private const ANALYTICS_EVENTS = [
        'INITIAL_PURCHASE' => 'server_subscription_started',
        'RENEWAL' => 'server_subscription_renewed',
        'UNCANCELLATION' => 'server_subscription_uncancelled',
        'NON_RENEWING_PURCHASE' => 'server_subscription_purchased',
        'CANCELLATION' => 'server_subscription_cancelled',
        'EXPIRATION' => 'server_subscription_expired',
        'BILLING_ISSUE' => 'server_subscription_billing_issue',
    ];

    public function __construct(private ProductAnalytics $analytics) {}

    /**
     * Apply one ledger event. The ledger row is locked for the duration, so
     * concurrent deliveries of the same event are applied once; a processed
     * row returns DUPLICATE. Throws on unexpected failures (the transaction
     * rolls back and the row stays unprocessed for a retry).
     */
    public function process(string $eventId): string
    {
        // 3 attempts: two different events for the same subscriber can
        // deadlock on the entitlement row under InnoDB; Laravel retries it.
        return DB::transaction(function () use ($eventId) {
            $row = RevenueCatEvent::whereKey($eventId)->lockForUpdate()->first();
            if (! $row) {
                throw new \RuntimeException('RevenueCat event is missing from the ledger');
            }
            if ($row->processed_at !== null) {
                return self::DUPLICATE;
            }

            $status = $this->apply($row);

            $row->forceFill([
                'attempts' => $row->attempts + 1,
                'status' => $status,
                'error' => null,
                // needs_sync stays unprocessed so the API sync / reconcile picks it up.
                'processed_at' => $status === self::NEEDS_SYNC ? null : now(),
            ])->save();

            return $status;
        }, 3);
    }

    private function apply(RevenueCatEvent $row): string
    {
        $event = $row->payload;
        $type = (string) ($event['type'] ?? '');

        $user = $this->resolveUser($event, $type);
        if ($user) {
            $row->forceFill(['user_id' => $user->id]);
        } else {
            // Keep no customer identifiers for any event that matches no
            // account (anonymous purchases, or events arriving after an account
            // was purged — no later purge would find them).
            $row->forceFill(['payload' => Arr::except($event, self::IDENTITY_FIELDS)]);
        }

        if (in_array($type, self::INFORMATIONAL, true)) {
            return self::IGNORED;
        }
        if (! $user) {
            return self::UNKNOWN_USER;
        }
        if (! in_array($type, self::APPLIED_TYPES, true)) {
            return self::NEEDS_SYNC; // PRODUCT_CHANGE, TRANSFER, or a type we don't know yet
        }

        $entitlementIds = array_values(array_filter(
            (array) ($event['entitlement_ids'] ?? [$event['entitlement_id'] ?? null]),
            fn ($id) => is_string($id) && $id !== '' && strlen($id) <= 64,
        ));
        if ($entitlementIds === []) {
            return self::IGNORED;
        }
        sort($entitlementIds); // a fixed lock order across concurrent events

        $results = array_map(fn ($id) => $this->applyToEntitlement($user, $id, $type, $event), $entitlementIds);
        $status = in_array(self::NEEDS_SYNC, $results, true) ? self::NEEDS_SYNC
            : (in_array(self::APPLIED, $results, true) ? self::APPLIED : self::STALE);

        if ($status === self::APPLIED && isset(self::ANALYTICS_EVENTS[$type])) {
            $this->analytics->capture($user, self::ANALYTICS_EVENTS[$type], array_filter([
                'store' => $this->enum($event['store'] ?? null),
                'environment' => $this->enum($event['environment'] ?? null),
                'period_type' => $this->enum($event['period_type'] ?? null),
                'product_id' => $this->enum($event['product_id'] ?? null),
            ], fn ($v) => $v !== null), (string) $row->id);
        }

        return $status;
    }

    private function applyToEntitlement(User $user, string $entitlementId, string $type, array $event): string
    {
        $timestamp = (int) ($event['event_timestamp_ms'] ?? 0);

        // Create the row first (no-op if it exists), then lock it: locking a
        // row that doesn't exist yet locks nothing, so two first events could
        // otherwise both insert and collide on the unique key.
        $now = now();
        UserEntitlement::query()->insertOrIgnore([
            'user_id' => $user->id,
            'entitlement' => $entitlementId,
            'will_renew' => false,
            'last_event_ms' => 0,
            'source' => 'webhook',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $entitlement = UserEntitlement::where('user_id', $user->id)
            ->where('entitlement', $entitlementId)
            ->lockForUpdate()
            ->firstOrFail();

        if ($entitlement->last_event_type !== null) {
            if ($entitlement->last_event_ms > $timestamp) {
                return self::STALE;
            }
            if ($entitlement->last_event_ms === $timestamp && $entitlement->last_event_type !== $type) {
                return self::NEEDS_SYNC; // same instant, different event: order unknown
            }
        }

        $at = $timestamp > 0 ? Carbon::createFromTimestampMs($timestamp) : now();
        $changes = [
            'store' => $this->column($event['store'] ?? null, 32) ?? $entitlement->store,
            'environment' => $this->column($event['environment'] ?? null, 16) ?? $entitlement->environment,
            'period_type' => $this->column($event['period_type'] ?? null, 16) ?? $entitlement->period_type,
            'last_event_ms' => $timestamp,
            'last_event_type' => $type,
            'source' => 'webhook',
        ];
        if (array_key_exists('expiration_at_ms', $event)) {
            $changes['expires_at'] = $event['expiration_at_ms'] === null
                ? null
                : Carbon::createFromTimestampMs((int) $event['expiration_at_ms']);
        }
        if (in_array($type, self::SETS_PRODUCT, true) && is_string($event['product_id'] ?? null)) {
            $changes['product_id'] = mb_substr($event['product_id'], 0, 191);
        }

        // Each type sets only what it means.
        $changes += match ($type) {
            'INITIAL_PURCHASE', 'RENEWAL' => ['will_renew' => true, 'billing_issue_at' => null, 'unsubscribed_at' => null],
            'UNCANCELLATION' => ['will_renew' => true, 'unsubscribed_at' => null],
            'NON_RENEWING_PURCHASE' => ['will_renew' => false],
            'CANCELLATION' => ['will_renew' => false, 'unsubscribed_at' => $at],
            'EXPIRATION', 'SUBSCRIPTION_PAUSED' => ['will_renew' => false],
            'BILLING_ISSUE' => ['billing_issue_at' => $at],
            // SUBSCRIPTION_EXTENDED, TEMPORARY_ENTITLEMENT_GRANT, REFUND_REVERSED:
            // only the expiry moves; renewal and billing state stay as they are.
            default => [],
        };

        $entitlement->forceFill($changes)->save();

        return self::APPLIED;
    }

    /**
     * The first of our own user ids (UUIDs) named by the event, if any.
     * Transfer ids only count on TRANSFER events (which change nothing here;
     * the link is for purge and the API sync).
     */
    private function resolveUser(array $event, string $type): ?User
    {
        $transfer = $type === 'TRANSFER'
            ? array_merge((array) ($event['transferred_to'] ?? []), (array) ($event['transferred_from'] ?? []))
            : [];
        $candidates = array_values(array_unique(array_filter(
            array_merge(
                [$event['app_user_id'] ?? null, $event['original_app_user_id'] ?? null],
                (array) ($event['aliases'] ?? []),
                $transfer,
            ),
            fn ($id) => is_string($id) && Str::isUuid($id),
        )));
        if ($candidates === []) {
            return null;
        }

        // One query; keep the event's own order of preference.
        $users = User::whereIn('id', $candidates)->get()->keyBy(fn (User $u) => strtolower((string) $u->id));
        foreach ($candidates as $id) {
            if ($user = $users->get(strtolower($id))) {
                return $user;
            }
        }

        return null;
    }

    /** A scalar string that fits its column, or null. */
    private function column(mixed $value, int $max): ?string
    {
        return is_string($value) && $value !== '' ? mb_substr($value, 0, $max) : null;
    }

    /** Short, identifier-shaped values only (store names, product ids). */
    private function enum(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^[A-Za-z0-9_.\-]{1,100}$/', $value) ? strtolower($value) : null;
    }
}
