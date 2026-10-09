<?php

namespace App\Services\Subscriptions;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Applies RevenueCat webhook events (stored in the revenuecat_events ledger)
 * to user_entitlements. The only writer of entitlement state besides the API
 * sync (D2). Nothing is gated on it yet.
 *
 * - The user comes from revenuecat_event_users (the webhook links only ids
 *   that are our users): app_user_id first, then original id, then aliases.
 *   Transfer links only count on TRANSFER events.
 * - Each event type changes only what it means (a support extension doesn't
 *   turn auto-renew back on; an uncancellation doesn't clear a billing issue).
 * - A missing expiry is never lifetime access: only a one-time purchase with
 *   no expiry sets is_lifetime. A billing grace period keeps access.
 * - Ordering: an event older than the last one applied is skipped; a
 *   different event with the SAME timestamp is ambiguous and left to the sync.
 * - Plan changes (PRODUCT_CHANGE), TRANSFER and unrecognised types are left to
 *   the API sync (needs_sync) — D2's reconcile job; until it exists they stay
 *   unprocessed in the ledger.
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

    /** Event types this writer applies. */
    private const APPLIED_TYPES = [
        'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE',
        'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED',
        'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED',
    ];

    /** Types that set the product (a new purchase or its renewal). */
    private const SETS_PRODUCT = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'];

    /** Acknowledged without changing anything. */
    private const INFORMATIONAL = ['TEST', 'INVOICE_ISSUANCE', 'VIRTUAL_CURRENCY_TRANSACTION', 'EXPERIMENT_ENROLLMENT'];

    /** Preference order of the links that identify the customer. */
    private const CUSTOMER_ROLES = ['app_user', 'original', 'alias'];

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

        $user = $this->resolveUser((string) $row->id, $type);
        if ($user) {
            $row->forceFill(['user_id' => $user->id]);
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
        $anyApplied = in_array(self::APPLIED, $results, true);

        if ($anyApplied && isset(self::ANALYTICS_EVENTS[$type])) {
            $this->captureAfterCommit($user, $type, $event, (string) $row->id);
        }

        return in_array(self::NEEDS_SYNC, $results, true) ? self::NEEDS_SYNC
            : ($anyApplied ? self::APPLIED : self::STALE);
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
            'is_lifetime' => false,
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
        $expiry = $this->instant($event['expiration_at_ms'] ?? null);
        $hasExpiryField = array_key_exists('expiration_at_ms', $event);

        $changes = [
            'store' => $this->column($event['store'] ?? null, 32) ?? $entitlement->store,
            'environment' => $this->column($event['environment'] ?? null, 16) ?? $entitlement->environment,
            'period_type' => $this->column($event['period_type'] ?? null, 16) ?? $entitlement->period_type,
            'last_event_ms' => $timestamp,
            'last_event_type' => $type,
            'source' => 'webhook',
        ];
        // A known expiry always applies. A missing / null one never becomes
        // "lifetime" by accident — only a one-time purchase grants that, and
        // a revocation of such a purchase ends it now.
        if ($expiry !== null) {
            $changes['expires_at'] = $expiry;
            $changes['is_lifetime'] = false;
        } elseif ($type === 'NON_RENEWING_PURCHASE' && $hasExpiryField) {
            $changes['is_lifetime'] = true;
            $changes['expires_at'] = null;
        } elseif (in_array($type, ['CANCELLATION', 'EXPIRATION'], true) && $entitlement->is_lifetime) {
            $changes['is_lifetime'] = false;
            $changes['expires_at'] = $at;
        }
        if (in_array($type, self::SETS_PRODUCT, true) && is_string($event['product_id'] ?? null)) {
            $changes['product_id'] = mb_substr($event['product_id'], 0, 191);
        }

        // Each type sets only what it means.
        $changes += match ($type) {
            'INITIAL_PURCHASE', 'RENEWAL' => [
                'will_renew' => true, 'billing_issue_at' => null, 'grace_expires_at' => null, 'unsubscribed_at' => null,
            ],
            'UNCANCELLATION' => ['will_renew' => true, 'unsubscribed_at' => null],
            'NON_RENEWING_PURCHASE' => ['will_renew' => false],
            'CANCELLATION' => ['will_renew' => false, 'unsubscribed_at' => $at],
            'EXPIRATION' => ['will_renew' => false, 'grace_expires_at' => null],
            'SUBSCRIPTION_PAUSED' => ['will_renew' => false],
            // Store keeps access through the billing grace period.
            'BILLING_ISSUE' => [
                'billing_issue_at' => $at,
                'grace_expires_at' => $this->instant($event['grace_period_expiration_at_ms'] ?? null),
            ],
            // SUBSCRIPTION_EXTENDED, TEMPORARY_ENTITLEMENT_GRANT, REFUND_REVERSED:
            // only the expiry moves; renewal and billing state stay as they are.
            default => [],
        };

        $entitlement->forceFill($changes)->save();

        return self::APPLIED;
    }

    /** The customer this event is about, from the webhook's user links. */
    private function resolveUser(string $eventId, string $type): ?User
    {
        $roles = $type === 'TRANSFER' ? ['transfer_to', 'transfer_from'] : self::CUSTOMER_ROLES;
        $links = DB::table('revenuecat_event_users')
            ->where('event_id', $eventId)
            ->whereIn('role', $roles)
            ->get(['user_id', 'role']);
        foreach ($roles as $role) {
            if ($link = $links->firstWhere('role', $role)) {
                return User::find($link->user_id);
            }
        }

        return null;
    }

    /**
     * Analytics only once the change is committed (a rolled-back event must
     * not be counted), timestamped with the event's own time so a redelivery
     * on another day dedupes on the same uuid + timestamp.
     */
    private function captureAfterCommit(User $user, string $type, array $event, string $eventId): void
    {
        $properties = array_filter([
            'store' => $this->enum($event['store'] ?? null),
            'environment' => $this->enum($event['environment'] ?? null),
            'period_type' => $this->enum($event['period_type'] ?? null),
            'product_id' => $this->enum($event['product_id'] ?? null),
        ], fn ($v) => $v !== null);
        $at = $this->instant($event['event_timestamp_ms'] ?? null);

        DB::afterCommit(fn () => $this->analytics->capture($user, self::ANALYTICS_EVENTS[$type], $properties, $eventId, $at));
    }

    private function instant(mixed $ms): ?Carbon
    {
        return is_numeric($ms) && (int) $ms > 0 ? Carbon::createFromTimestampMs((int) $ms) : null;
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
