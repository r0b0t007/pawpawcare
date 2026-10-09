<?php

namespace App\Services\Subscriptions;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Analytics\ProductAnalytics;
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
 * - Events can arrive out of order: an event older than the last one applied
 *   to an entitlement is skipped (last_event_ms guard).
 * - Sandbox events are applied too (App Review buys in sandbox).
 * - TRANSFER and unrecognised types are left for the API sync (needs_sync).
 */
class EntitlementWriter
{
    public const APPLIED = 'applied';

    public const STALE = 'stale';

    public const IGNORED = 'ignored';

    public const UNKNOWN_USER = 'unknown_user';

    public const NEEDS_SYNC = 'needs_sync';

    /** Event types that grant / keep access. */
    private const GRANTING = [
        'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE',
        'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT',
        'REFUND_REVERSED',
    ];

    /** Event types that change an existing subscription's state. */
    private const STATE_CHANGES = ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED'];

    /** Acknowledged without changing anything. */
    private const INFORMATIONAL = ['TEST', 'INVOICE_ISSUANCE', 'VIRTUAL_CURRENCY_TRANSACTION', 'EXPERIMENT_ENROLLMENT'];

    /** Server analytics event name per RevenueCat type. */
    private const ANALYTICS_EVENTS = [
        'INITIAL_PURCHASE' => 'server_subscription_started',
        'RENEWAL' => 'server_subscription_renewed',
        'UNCANCELLATION' => 'server_subscription_uncancelled',
        'PRODUCT_CHANGE' => 'server_subscription_product_changed',
        'NON_RENEWING_PURCHASE' => 'server_subscription_purchased',
        'CANCELLATION' => 'server_subscription_cancelled',
        'EXPIRATION' => 'server_subscription_expired',
        'BILLING_ISSUE' => 'server_subscription_billing_issue',
    ];

    public function __construct(private ProductAnalytics $analytics) {}

    /**
     * Apply one ledger event and record the outcome on the ledger row. Throws
     * only on unexpected failures (the row then stays unprocessed for retry).
     */
    public function process(RevenueCatEvent $row): string
    {
        $row->forceFill(['attempts' => $row->attempts + 1])->save();

        $status = DB::transaction(fn () => $this->apply($row));

        $row->forceFill([
            // needs_sync stays unprocessed so the API sync / reconcile picks it up.
            'processed_at' => $status === self::NEEDS_SYNC ? null : now(),
            'error' => in_array($status, [self::NEEDS_SYNC, self::UNKNOWN_USER], true) ? $status : null,
        ])->save();

        return $status;
    }

    private function apply(RevenueCatEvent $row): string
    {
        $event = $row->payload;
        $type = (string) ($event['type'] ?? '');

        if (in_array($type, self::INFORMATIONAL, true)) {
            return self::IGNORED;
        }
        if (! in_array($type, self::GRANTING, true) && ! in_array($type, self::STATE_CHANGES, true)) {
            return self::NEEDS_SYNC; // TRANSFER, or a type we don't know yet
        }

        $user = $this->resolveUser($event);
        if (! $user) {
            return self::UNKNOWN_USER;
        }
        $row->forceFill(['user_id' => $user->id])->save();

        $entitlementIds = array_values(array_filter(
            (array) ($event['entitlement_ids'] ?? [$event['entitlement_id'] ?? null]),
            fn ($id) => is_string($id) && $id !== '' && strlen($id) <= 64,
        ));
        if ($entitlementIds === []) {
            return self::IGNORED;
        }

        $applied = false;
        foreach ($entitlementIds as $entitlementId) {
            $applied = $this->applyToEntitlement($user, $entitlementId, $type, $event) || $applied;
        }

        if ($applied && isset(self::ANALYTICS_EVENTS[$type])) {
            $this->analytics->capture($user, self::ANALYTICS_EVENTS[$type], array_filter([
                'store' => $this->enum($event['store'] ?? null),
                'environment' => $this->enum($event['environment'] ?? null),
                'period_type' => $this->enum($event['period_type'] ?? null),
                'product_id' => $this->enum($event['new_product_id'] ?? $event['product_id'] ?? null),
            ], fn ($v) => $v !== null), (string) $row->id);
        }

        return $applied ? self::APPLIED : self::STALE;
    }

    /** Returns false when a newer event was already applied (stale). */
    private function applyToEntitlement(User $user, string $entitlementId, string $type, array $event): bool
    {
        $timestamp = (int) ($event['event_timestamp_ms'] ?? 0);
        $entitlement = UserEntitlement::where('user_id', $user->id)
            ->where('entitlement', $entitlementId)
            ->lockForUpdate()
            ->first()
            ?? (new UserEntitlement)->forceFill(['user_id' => $user->id, 'entitlement' => $entitlementId]);

        if ($entitlement->exists && $entitlement->last_event_ms > $timestamp) {
            return false;
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
        $productId = $event['new_product_id'] ?? $event['product_id'] ?? null;
        if (is_string($productId)) {
            $changes['product_id'] = Str::limit($productId, 191, '');
        }

        if (in_array($type, self::GRANTING, true)) {
            $changes += [
                'will_renew' => ! in_array($type, ['NON_RENEWING_PURCHASE', 'TEMPORARY_ENTITLEMENT_GRANT'], true),
                'billing_issue_at' => null,
                'unsubscribed_at' => null,
            ];
        } else {
            $changes += match ($type) {
                'CANCELLATION' => ['will_renew' => false, 'unsubscribed_at' => $at],
                'EXPIRATION', 'SUBSCRIPTION_PAUSED' => ['will_renew' => false],
                'BILLING_ISSUE' => ['billing_issue_at' => $at],
            };
        }

        $entitlement->forceFill($changes)->save();

        return true;
    }

    /** The first of our own user ids (UUIDs) named by the event, if any. */
    private function resolveUser(array $event): ?User
    {
        $candidates = array_merge(
            [$event['app_user_id'] ?? null, $event['original_app_user_id'] ?? null],
            (array) ($event['aliases'] ?? []),
        );
        foreach (array_unique(array_filter($candidates, 'is_string')) as $id) {
            if (Str::isUuid($id) && ($user = User::find($id))) {
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
