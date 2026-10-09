<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\JwtService;
use App\Services\Subscriptions\Entitlements;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EntitlementsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(array $attrs = []): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $u->forceFill($attrs + ['email_verified_at' => now()])->save();

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
    }

    private function plan(User $user, array $attrs = []): UserEntitlement
    {
        $row = (new UserEntitlement)->forceFill($attrs + [
            'user_id' => $user->id,
            'entitlement' => 'plus',
            'environment' => 'PRODUCTION',
            'store' => 'APP_STORE',
            'expires_at' => now()->addMonth(),
            'will_renew' => true,
            'last_event_ms' => 1,
            'last_event_type' => 'INITIAL_PURCHASE',
        ]);
        $row->save();

        return $row;
    }

    private function gate(string $feature): void
    {
        config(['entitlements.paywall_enabled' => true, "entitlements.gates.{$feature}" => true]);
    }

    private function entitlements(): Entitlements
    {
        return new Entitlements; // fresh per check (the service caches per instance)
    }

    // ── Off by default ───────────────────────────────────────────────────────

    public function test_nothing_is_gated_while_the_paywall_is_off(): void
    {
        [$user, $token] = $this->user();
        config(['entitlements.gates.care_links' => true, 'entitlements.gates.ai_extraction' => true]);

        $this->assertTrue($this->entitlements()->allows($user, 'care_links'));
        $this->withToken($token)->postJson("/pets/{$this->pet($user)->id}/care-link")->assertOk();
        $this->withToken($token)->getJson('/users/me')->assertOk()
            ->assertJsonPath('plan.tier', 'free')
            ->assertJsonPath('features.paywall_enabled', false)
            ->assertJsonPath('features.subscriptions_visible', false)
            ->assertJsonPath('features.gated', ['ai_extraction' => false, 'care_links' => false]);
    }

    public function test_core_features_can_never_be_gated(): void
    {
        [$user] = $this->user();
        config(['entitlements.paywall_enabled' => true]);
        foreach (Entitlements::NEVER_GATED as $feature) {
            config(["entitlements.gates.{$feature}" => true]);
            $this->assertTrue($this->entitlements()->allows($user, $feature), $feature);
        }

        $this->assertSame([], array_intersect(Entitlements::NEVER_GATED, Entitlements::GATEABLE));
        $this->assertEqualsCanonicalizing(Entitlements::GATEABLE, array_keys((require config_path('entitlements.php'))['gates']));
    }

    public function test_an_unknown_feature_is_a_programming_error(): void
    {
        [$user] = $this->user();
        $this->expectException(\InvalidArgumentException::class);

        $this->entitlements()->allows($user, 'typo_feature');
    }

    // ── Gating ───────────────────────────────────────────────────────────────

    public function test_a_gated_feature_answers_402_upgrade_required_and_is_not_reported(): void
    {
        [$user, $token] = $this->user();
        $this->gate('care_links');
        Exceptions::fake();

        $this->withToken($token)->postJson("/pets/{$this->pet($user)->id}/care-link")
            ->assertStatus(402)
            ->assertJson(['code' => 'upgrade_required', 'feature' => 'care_links'])
            ->assertJsonStructure(['detail']);

        Exceptions::assertNothingReported();
    }

    public function test_an_active_plan_unlocks_gated_features(): void
    {
        [$user, $token] = $this->user();
        $this->gate('care_links');
        $this->plan($user);

        $this->withToken($token)->postJson("/pets/{$this->pet($user)->id}/care-link")->assertOk();
        $this->withToken($token)->getJson('/users/me')->assertOk()
            ->assertJsonPath('plan.tier', 'plus')
            ->assertJsonPath('plan.will_renew', true)
            ->assertJsonPath('plan.store', 'app_store')
            ->assertJsonPath('features.gated.care_links', false);
    }

    public function test_the_pet_owners_plan_covers_co_owners_on_that_pet_only(): void
    {
        [$owner] = $this->user();
        [$member, $memberToken] = $this->user();
        $this->gate('care_links');
        $this->plan($owner);
        $shared = $this->pet($owner);
        $shared->members()->attach($member->id, ['role' => 'member', 'created_at' => now()]);

        $this->withToken($memberToken)->postJson("/pets/{$shared->id}/care-link")->assertOk();
        $this->withToken($memberToken)->postJson("/pets/{$this->pet($member)->id}/care-link")->assertStatus(402);
    }

    public function test_sandbox_and_test_store_plans_only_count_for_allowlisted_users(): void
    {
        [$sandboxUser] = $this->user();
        [$testStoreUser] = $this->user();
        $this->plan($sandboxUser, ['environment' => 'SANDBOX']);
        $this->plan($testStoreUser, ['store' => 'TEST_STORE']);

        $this->assertFalse($this->entitlements()->hasPlan($sandboxUser));
        $this->assertFalse($this->entitlements()->hasPlan($testStoreUser));

        config(['entitlements.sandbox_user_ids' => [strtoupper($sandboxUser->id)]]); // App Review account
        $this->assertTrue($this->entitlements()->hasPlan($sandboxUser));
    }

    public function test_only_unexpired_lifetime_or_grace_plans_count(): void
    {
        [$expired] = $this->user();
        [$unknownExpiry] = $this->user();
        [$lifetime] = $this->user();
        [$inGrace] = $this->user();
        $this->plan($expired, ['expires_at' => now()->subMinute()]);
        $this->plan($unknownExpiry, ['expires_at' => null]);
        $this->plan($lifetime, ['expires_at' => null, 'is_lifetime' => true, 'will_renew' => false]);
        $this->plan($inGrace, ['expires_at' => now()->subDay(), 'grace_expires_at' => now()->addDays(5), 'billing_issue_at' => now()]);

        $this->assertFalse($this->entitlements()->hasPlan($expired));
        $this->assertFalse($this->entitlements()->hasPlan($unknownExpiry));
        $this->assertTrue($this->entitlements()->hasPlan($lifetime));
        $grace = $this->entitlements()->snapshot($inGrace);
        $this->assertSame('plus', $grace['tier']);
        $this->assertTrue($grace['in_grace_period']);
        $this->assertTrue($grace['billing_issue']);
    }

    public function test_grandfathered_accounts_keep_gated_features(): void
    {
        [$early, $token] = $this->user();
        $this->gate('care_links');
        config(['entitlements.grandfather_before' => now()->addDay()->toDateString()]);

        $this->withToken($token)->postJson("/pets/{$this->pet($early)->id}/care-link")->assertOk();
        $this->withToken($token)->getJson('/users/me')
            ->assertJsonPath('plan.tier', 'free')
            ->assertJsonPath('plan.grandfathered', true);

        config(['entitlements.grandfather_before' => 'not a date']);
        $this->assertFalse($this->entitlements()->allows($early, 'care_links'));
    }

    public function test_free_ai_extractions_are_counted_per_pet_owner_per_month(): void
    {
        [$owner] = $this->user();
        $pet = $this->pet($owner);
        $this->gate('ai_extraction');
        config(['entitlements.free_ai_extractions' => 2]);
        $read = fn ($when) => (new Document)->forceFill([
            'pet_id' => $pet->id, 'title' => 'Record', 'file_path' => 'x.jpg',
            'extraction_status' => 'done', 'extracted_at' => $when,
        ])->save();

        $read(now()->subMonthNoOverflow()->startOfMonth()); // last month doesn't count
        $read(now());
        $this->assertTrue($this->entitlements()->allows($owner, 'ai_extraction', $pet));

        $read(now());
        $this->assertFalse($this->entitlements()->allows($owner, 'ai_extraction', $pet));
    }

    // ── /users/me + deletion ─────────────────────────────────────────────────

    public function test_subscription_visibility_follows_the_server_switch(): void
    {
        [, $userToken] = $this->user();
        [, $adminToken] = $this->user(['is_admin' => true]);

        config(['entitlements.subscriptions_visible' => 'admins']);
        $this->withToken($userToken)->getJson('/users/me')->assertJsonPath('features.subscriptions_visible', false);
        $this->withToken($adminToken)->getJson('/users/me')->assertJsonPath('features.subscriptions_visible', true);

        config(['entitlements.subscriptions_visible' => 'all']);
        $this->withToken($userToken)->getJson('/users/me')->assertJsonPath('features.subscriptions_visible', true);
    }

    public function test_deleting_the_account_warns_when_store_billing_continues(): void
    {
        [$subscriber, $subscriberToken] = $this->user();
        [$lifetime, $lifetimeToken] = $this->user();
        $this->plan($subscriber);
        $this->plan($lifetime, ['expires_at' => null, 'is_lifetime' => true, 'will_renew' => false]);

        $this->withToken($subscriberToken)->deleteJson('/users/me')->assertOk()->assertJsonPath('has_active_subscription', true);
        $this->withToken($lifetimeToken)->deleteJson('/users/me')->assertOk()->assertJsonPath('has_active_subscription', false);
    }
}
