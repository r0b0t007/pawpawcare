<?php

namespace App\Services\Subscriptions;

use App\Exceptions\UpgradeRequired;
use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use App\Models\UserEntitlement;
use Illuminate\Support\Carbon;

/**
 * Who may use what. The only place gating is decided; while the paywall is
 * off (the default — config/entitlements.php) every check passes.
 *
 * A pet owner's plan covers everyone the pet is shared with: a co-owner
 * working on that pet gets the owner's plus features.
 */
class Entitlements
{
    /**
     * Never behind a plan, whatever is configured — the promise on the site,
     * in the terms and in the app ("your records are never locked").
     */
    public const NEVER_GATED = ['pets', 'records', 'export', 'basic_sharing', 'account_deletion', 'data_access'];

    /** Features a gate can be switched on for (config entitlements.gates). */
    public const GATEABLE = ['ai_extraction', 'care_links'];

    /** @var array<string, ?UserEntitlement> per-request cache of the plan row */
    private array $plans = [];

    public function allows(User $user, string $feature, ?Pet $pet = null): bool
    {
        if (in_array($feature, self::NEVER_GATED, true)) {
            return true;
        }
        if (! in_array($feature, self::GATEABLE, true)) {
            throw new \InvalidArgumentException("Unknown feature: {$feature}");
        }
        if (! config('entitlements.paywall_enabled') || ! config("entitlements.gates.{$feature}")) {
            return true;
        }

        $owner = $pet && (string) $pet->owner_id !== (string) $user->id ? $pet->owner : null;
        foreach (array_filter([$user, $owner]) as $holder) {
            if ($this->hasPlan($holder) || $this->grandfathered($holder)) {
                return true;
            }
        }

        if ($feature === 'ai_extraction') {
            return $this->extractionsThisMonth($owner ?? $user) < (int) config('entitlements.free_ai_extractions');
        }

        return false;
    }

    /** @throws UpgradeRequired */
    public function authorize(User $user, string $feature, ?Pet $pet = null): void
    {
        if (! $this->allows($user, $feature, $pet)) {
            throw new UpgradeRequired($feature);
        }
    }

    /** An active plan (lifetime, unexpired or in billing grace) that counts. */
    public function hasPlan(User $user): bool
    {
        return $this->plan($user) !== null;
    }

    /** The /users/me `plan` block. */
    public function snapshot(User $user): array
    {
        $row = $this->plan($user);
        $active = $row !== null;

        return [
            'tier' => $active ? 'plus' : 'free',
            'entitlement' => (string) config('entitlements.entitlement'),
            'active' => $active,
            'is_lifetime' => $active && $row->is_lifetime,
            'expires_at' => $active ? $row->expires_at?->toISOString() : null,
            'will_renew' => $active && $row->will_renew,
            'billing_issue' => $active && $row->billing_issue_at !== null,
            'in_grace_period' => $active && $row->grace_expires_at?->isFuture() && ! $row->expires_at?->isFuture(),
            'store' => $active && $row->store ? strtolower($row->store) : null,
            'grandfathered' => $this->grandfathered($user),
        ];
    }

    /** The /users/me `features` block: switches the app reads instead of shipping updates. */
    public function features(User $user): array
    {
        $visible = match ((string) config('entitlements.subscriptions_visible')) {
            'all' => true,
            'admins' => (bool) $user->is_admin,
            default => false,
        };
        $gated = [];
        foreach (self::GATEABLE as $feature) {
            $gated[$feature] = ! $this->allows($user, $feature);
        }

        return [
            'paywall_enabled' => (bool) config('entitlements.paywall_enabled'),
            'subscriptions_visible' => $visible,
            'gated' => $gated,
        ];
    }

    /** Store billing that continues after the account is deleted. */
    public function hasRenewingSubscription(User $user): bool
    {
        $row = $this->plan($user);

        return $row !== null && $row->will_renew && ! $row->is_lifetime;
    }

    /** Sandbox / test-store purchases count only for allowlisted users (App Review). */
    public static function sandboxAllowed(User $user): bool
    {
        return in_array(strtolower((string) $user->id), array_map('strtolower', config('entitlements.sandbox_user_ids', [])), true);
    }

    private function plan(User $user): ?UserEntitlement
    {
        $key = (string) $user->id;
        if (! array_key_exists($key, $this->plans)) {
            $row = UserEntitlement::where('user_id', $user->id)
                ->where('entitlement', (string) config('entitlements.entitlement'))
                ->first();
            $this->plans[$key] = $row && $this->counts($row, $user) && $row->isActive() ? $row : null;
        }

        return $this->plans[$key];
    }

    private function counts(UserEntitlement $row, User $user): bool
    {
        $production = $row->environment === null || strtoupper($row->environment) === 'PRODUCTION';
        $testStore = $row->store !== null && strtoupper($row->store) === 'TEST_STORE';

        return ($production && ! $testStore) || self::sandboxAllowed($user);
    }

    private function grandfathered(User $user): bool
    {
        $before = config('entitlements.grandfather_before');
        if (! $before || ! $user->created_at) {
            return false;
        }

        try {
            return $user->created_at->lt(Carbon::parse($before)->startOfDay());
        } catch (\Throwable) {
            return false; // a malformed date grandfathers no one
        }
    }

    /** AI document reads done this calendar month on this owner's pets. */
    private function extractionsThisMonth(User $owner): int
    {
        return Document::whereIn('pet_id', Pet::where('owner_id', $owner->id)->select('id'))
            ->where('extraction_status', 'done')
            ->where('extracted_at', '>=', now()->startOfMonth())
            ->count();
    }
}
