<?php

namespace App\Services\Subscriptions;

use App\Models\User;
use App\Models\UserEntitlement;
use App\Support\ReportOnce;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Rebuilds a user's entitlements from RevenueCat's API — the source of truth
 * the webhook only approximates. Used right after a purchase / restore (the
 * app calls POST /users/me/subscription/sync), for events the webhook can't
 * apply on its own (transfers, plan changes, ties), and by the daily sweep.
 *
 * - Only production purchases count, except for allowlisted users (the App
 *   Review account): sandbox and test-store items are skipped here, and the
 *   read side (Entitlements) ignores them too.
 * - A one-time purchase that is owned (not refunded) and not consumable is
 *   lifetime access. Subscriptions count while RevenueCat says they give
 *   access; one past its period end (billing grace, an open-ended pause)
 *   gets a one-day grace that the next sync renews or ends.
 * - Writes are stamped with the time RevenueCat was READ: an event that
 *   arrives later but happened before that is re-checked by another sync
 *   (the writer returns needs_sync); a row a newer webhook event updated
 *   while we were reading is left alone.
 * - A purchase whose product details are missing is never lifetime: it gets
 *   the one-day grace and the daily sweep re-checks it.
 */
class EntitlementSync
{
    /** auto_renewal_status values meaning the user will be charged again. */
    private const RENEWING = ['will_renew', 'has_already_renewed', 'will_change_product'];

    public function __construct(private RevenueCatClient $client) {}

    public function configured(): bool
    {
        return $this->client->configured();
    }

    /** After sync() returned false: was RevenueCat down (vs. this one customer failing)? */
    public function lastFailureWasOutage(): bool
    {
        return $this->client->lastFailureWasOutage();
    }

    /** True when the user's entitlements now match RevenueCat; false if it couldn't be reached. */
    public function sync(User $user): bool
    {
        $readAtMs = now()->getTimestampMs();
        $access = $this->client->customerAccess((string) $user->id);
        if ($access === null) {
            return false;
        }

        $allowSandbox = Entitlements::sandboxAllowed($user);
        $granted = [];
        foreach ($access['subscriptions'] as $sub) {
            if (($sub['gives_access'] ?? false) !== true || ! $this->counts($sub, $allowSandbox)) {
                continue;
            }
            $end = $this->instant($sub['ends_at'] ?? null) ?? $this->instant($sub['current_period_ends_at'] ?? null);
            $state = [
                'is_lifetime' => false,
                'expires_at' => $end,
                'grace_expires_at' => $end === null || $end->isPast() ? now()->addDay() : null,
                'will_renew' => in_array($sub['auto_renewal_status'] ?? null, self::RENEWING, true),
                'billing_issue' => in_array($sub['status'] ?? null, ['in_grace_period', 'in_billing_retry'], true),
                'period_type' => ($sub['status'] ?? null) === 'trialing' ? 'TRIAL' : 'NORMAL',
            ];
            $this->grant($granted, $sub, $state);
        }
        foreach ($access['purchases'] as $purchase) {
            if (($purchase['status'] ?? null) !== 'owned' || ! $this->counts($purchase, $allowSandbox)) {
                continue;
            }
            $consumable = $this->isConsumable($purchase);
            if ($consumable === true) {
                continue;
            }
            $known = $consumable === false && $this->storeProductId($purchase) !== null;
            if (! $known) {
                ReportOnce::log('revenuecat-sync:product-details', 'warning',
                    'RevenueCat returned a one-time purchase without product details; granting a one-day grace instead of lifetime.', 86400);
            }
            $this->grant($granted, $purchase, [
                'is_lifetime' => $known,
                'expires_at' => null,
                'grace_expires_at' => $known ? null : now()->addDay(),
                'will_renew' => false,
                'billing_issue' => false,
                'period_type' => 'NORMAL',
            ]);
        }

        $this->write($user, $granted, $readAtMs);

        return true;
    }

    /** Merge one item's state into each entitlement it grants (lifetime / longest access wins). */
    private function grant(array &$granted, array $item, array $state): void
    {
        $state += [
            'store' => strtoupper(substr((string) ($item['store'] ?? ''), 0, 32)) ?: null,
            'environment' => strtoupper(substr((string) ($item['environment'] ?? ''), 0, 16)) ?: null,
            'product_id' => $this->storeProductId($item),
        ];
        foreach ($item['entitlements']['items'] ?? [] as $entitlement) {
            $key = $entitlement['lookup_key'] ?? null;
            if (! is_string($key) || $key === '' || strlen($key) > 64) {
                continue;
            }
            $current = $granted[$key] ?? null;
            if ($current === null || $this->outlasts($state, $current)) {
                $granted[$key] = $state;
            }
        }
    }

    private function outlasts(array $a, array $b): bool
    {
        if ($a['is_lifetime'] !== $b['is_lifetime']) {
            return $a['is_lifetime'];
        }
        $until = fn (array $s) => max($s['expires_at']?->getTimestamp() ?? 0, $s['grace_expires_at']?->getTimestamp() ?? 0);

        return $until($a) > $until($b);
    }

    /** @param array<string, array> $granted lookup key → state */
    private function write(User $user, array $granted, int $readAtMs): void
    {
        DB::transaction(function () use ($user, $granted, $readAtMs) {
            $keys = array_unique(array_merge(
                array_keys($granted),
                UserEntitlement::where('user_id', $user->id)->pluck('entitlement')->all(),
            ));
            sort($keys); // same lock order as the webhook writer

            foreach ($keys as $key) {
                $state = $granted[$key] ?? null;
                if ($state !== null) {
                    UserEntitlement::query()->insertOrIgnore([
                        'user_id' => $user->id, 'entitlement' => $key, 'is_lifetime' => false, 'will_renew' => false,
                        'last_event_ms' => 0, 'source' => 'sync', 'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
                $row = UserEntitlement::where('user_id', $user->id)->where('entitlement', $key)->lockForUpdate()->first();
                // A webhook event newer than our read was applied meanwhile:
                // it knows more than we do.
                if (! $row || ($row->last_event_ms > $readAtMs && $row->last_event_type !== 'SYNC')) {
                    continue;
                }

                $changes = ['last_event_ms' => max($readAtMs, $row->last_event_ms), 'last_event_type' => 'SYNC', 'source' => 'sync'];
                if ($state === null) {
                    // No access any more: end it now, keep the history.
                    $changes += [
                        'is_lifetime' => false,
                        'grace_expires_at' => null,
                        'billing_issue_at' => null,
                        'will_renew' => false,
                        'expires_at' => $row->expires_at !== null && $row->expires_at->isPast() ? $row->expires_at : now(),
                    ];
                } else {
                    $changes += [
                        'is_lifetime' => $state['is_lifetime'],
                        'expires_at' => $state['expires_at'],
                        'grace_expires_at' => $state['grace_expires_at'],
                        'will_renew' => $state['will_renew'],
                        'billing_issue_at' => $state['billing_issue'] ? ($row->billing_issue_at ?? now()) : null,
                        'unsubscribed_at' => $state['will_renew'] || $state['is_lifetime'] ? null : ($row->unsubscribed_at ?? now()),
                        'period_type' => $state['period_type'],
                        'store' => $state['store'],
                        'environment' => $state['environment'],
                        // Lifetime always records its own product: the webhook's
                        // lifetime guard compares it with each event's product.
                        'product_id' => $state['is_lifetime'] ? $state['product_id'] : ($state['product_id'] ?? $row->product_id),
                    ];
                }
                $row->forceFill($changes)->save();
            }
        }, 3);
    }

    private function counts(array $item, bool $allowSandbox): bool
    {
        return $allowSandbox
            || (($item['environment'] ?? null) === 'production' && ($item['store'] ?? null) !== 'test_store');
    }

    /** The purchased product as listed under its entitlements (RevenueCat only gives its own id). */
    private function productOf(array $item): ?array
    {
        foreach ($item['entitlements']['items'] ?? [] as $entitlement) {
            foreach ($entitlement['products']['items'] ?? [] as $product) {
                if (is_array($product) && ($product['id'] ?? null) === ($item['product_id'] ?? false)) {
                    return $product;
                }
            }
        }

        return null;
    }

    /** The store's product identifier (what webhooks send as product_id). */
    private function storeProductId(array $item): ?string
    {
        $id = $this->productOf($item)['store_identifier'] ?? null;

        return is_string($id) && $id !== '' ? mb_substr($id, 0, 191) : null;
    }

    /** true / false, or null when RevenueCat didn't say. */
    private function isConsumable(array $purchase): ?bool
    {
        $value = $this->productOf($purchase)['one_time']['is_consumable'] ?? null;

        return is_bool($value) ? $value : null;
    }

    private function instant(mixed $ms): ?Carbon
    {
        return is_int($ms) && $ms > 0 ? Carbon::createFromTimestampMs($ms) : null;
    }
}
