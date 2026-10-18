<?php

namespace App\Services\Subscriptions;

use App\Exceptions\UpgradeRequired;
use App\Models\Pet;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Support\ReportOnce;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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

    /**
     * Features a gate can be switched on for (config entitlements.gates).
     *
     * Both are advertised as plain features in the store listings
     * (frontend/store.config.json, frontend/fastlane/metadata/android): AI
     * reading of vet documents and the sitter (caretaker) link. Before
     * enabling a gate, update every locale there to say it needs a plan —
     * App Store 2.3.2 and Play's metadata policy require paid features to be
     * labelled as such.
     */
    public const GATEABLE = ['ai_extraction', 'care_links'];

    /** Gated features with a free monthly allowance → its config key. */
    private const FREE_ALLOWANCE = ['ai_extraction' => 'entitlements.free_ai_extractions'];

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
        if ($this->unlimited($user, $feature, $pet)) {
            return true;
        }
        $limit = $this->allowance($feature);

        return $limit > 0 && $this->usesThisMonth($this->payer($user, $pet), $feature) < $limit;
    }

    /**
     * Enforce a gate. For a metered feature without a plan this also uses one
     * free allowance unit, atomically (parallel requests can't overshoot) —
     * returns true when it did, so a failed operation can refund() it.
     *
     * @throws UpgradeRequired
     */
    public function authorize(User $user, string $feature, ?Pet $pet = null): bool
    {
        if ($this->unlimited($user, $feature, $pet)) {
            return false;
        }
        if ($this->consume($this->payer($user, $pet), $feature)) {
            return true;
        }

        throw new UpgradeRequired($feature);
    }

    /** Give back a unit authorize() used, when the operation failed. */
    public function refund(User $user, string $feature, ?Pet $pet = null): void
    {
        DB::table('feature_usage')
            ->where(['user_id' => $this->payer($user, $pet)->id, 'feature' => $feature, 'period' => now()->format('Y-m')])
            ->where('uses', '>', 0)
            ->decrement('uses');
    }

    /** Not gated right now, or covered by a plan / grandfathering. */
    private function unlimited(User $user, string $feature, ?Pet $pet): bool
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
        $owner = $this->petOwner($user, $pet);
        foreach (array_filter([$user, $owner]) as $holder) {
            if ($this->hasPlan($holder) || $this->grandfathered($holder)) {
                return true;
            }
        }

        return false;
    }

    /** Free allowances are the pet owner's (co-owners draw on the owner's). */
    private function payer(User $user, ?Pet $pet): User
    {
        return $this->petOwner($user, $pet) ?? $user;
    }

    private function petOwner(User $user, ?Pet $pet): ?User
    {
        return $pet && (string) $pet->owner_id !== (string) $user->id ? $pet->owner : null;
    }

    private function allowance(string $feature): int
    {
        return isset(self::FREE_ALLOWANCE[$feature]) ? max(0, (int) config(self::FREE_ALLOWANCE[$feature])) : 0;
    }

    private function consume(User $payer, string $feature): bool
    {
        $limit = $this->allowance($feature);
        if ($limit === 0) {
            return false;
        }
        $key = ['user_id' => $payer->id, 'feature' => $feature, 'period' => now()->format('Y-m')];
        DB::table('feature_usage')->insertOrIgnore($key + ['uses' => 0]);

        return DB::table('feature_usage')->where($key)->where('uses', '<', $limit)->increment('uses') === 1;
    }

    private function usesThisMonth(User $payer, string $feature): int
    {
        return (int) DB::table('feature_usage')
            ->where(['user_id' => $payer->id, 'feature' => $feature, 'period' => now()->format('Y-m')])
            ->value('uses');
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
        $before = (string) config('entitlements.grandfather_before');
        if ($before === '' || ! $user->created_at) {
            return false;
        }

        // Strictly Y-m-d: a relative string ("tomorrow") would grandfather
        // everyone forever. A malformed value grandfathers no one, loudly.
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $before); // false, not an exception
        if (! $date || $date->format('Y-m-d') !== $before) {
            ReportOnce::log('entitlements:grandfather-date', 'error',
                'PAYWALL_GRANDFATHER_BEFORE must be a date like 2026-12-31; nobody is grandfathered until it is fixed.', 86400);

            return false;
        }

        return $user->created_at->lt($date);
    }
}
