<?php

namespace Tests\Feature;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\JwtService;
use App\Services\Subscriptions\EntitlementSync;
use App\Services\Subscriptions\RevenueCatClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class SubscriptionSyncTest extends TestCase
{
    use RefreshDatabase;

    private const RC = 'https://api.revenuecat.com/v2/projects/proj_test/customers/';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.revenuecat.secret_key' => 'sk_test', 'services.revenuecat.project_id' => 'proj_test']);
    }

    /** @return array{0: User, 1: string} */
    private function user(): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function entitlementItems(string $storeId, ?bool $consumable = null): array
    {
        return ['object' => 'list', 'items' => [[
            'object' => 'entitlement', 'id' => 'entl_plus', 'lookup_key' => 'plus', 'state' => 'active',
            'products' => ['object' => 'list', 'items' => [[
                'object' => 'product', 'id' => 'prod_1', 'store_identifier' => $storeId,
                'one_time' => ['is_consumable' => $consumable],
            ]]],
        ]]];
    }

    /** A RevenueCat API v2 subscription object. */
    private function sub(array $overrides = []): array
    {
        return array_merge([
            'object' => 'subscription', 'id' => 'sub_1', 'product_id' => 'prod_1',
            'current_period_ends_at' => now()->addMonth()->getTimestampMs(), 'ends_at' => now()->addMonth()->getTimestampMs(),
            'gives_access' => true, 'auto_renewal_status' => 'will_renew', 'status' => 'active',
            'environment' => 'production', 'store' => 'app_store',
            'entitlements' => $this->entitlementItems('plus_monthly'),
        ], $overrides);
    }

    private function purchase(array $overrides = [], ?bool $consumable = false): array
    {
        return array_merge([
            'object' => 'purchase', 'id' => 'purch_1', 'product_id' => 'prod_1', 'status' => 'owned',
            'environment' => 'production', 'store' => 'play_store',
            'entitlements' => $this->entitlementItems('plus_lifetime', $consumable),
        ], $overrides);
    }

    /** Current fake RevenueCat state; tests change it between calls. */
    private ?array $customers = null;

    /**
     * Fake RevenueCat: per-customer subscriptions + purchases (unlisted
     * customers: none). Http::fake stubs don't replace each other, so the
     * fake is installed once and reads the current state.
     */
    private function fakeRevenueCat(array $customers): void
    {
        $installed = $this->customers !== null;
        $this->customers = $customers;
        if ($installed) {
            return;
        }
        Http::fake(function (Request $request) {
            if (! str_starts_with($request->url(), self::RC)) {
                return Http::response([], 404);
            }
            $path = substr(strtok($request->url(), '?'), strlen(self::RC));
            [$customer, $list] = explode('/', $path) + [1 => null];
            if ($request->method() === 'DELETE') {
                return Http::response(['customer' => []]);
            }

            return Http::response(['object' => 'list', 'items' => $this->customers[$customer][$list] ?? [], 'next_page' => null]);
        });
    }

    private function entitlement(User $user): ?UserEntitlement
    {
        return UserEntitlement::where('user_id', $user->id)->where('entitlement', 'plus')->first();
    }

    // ── Sync endpoint ────────────────────────────────────────────────────────

    public function test_sync_reads_the_plan_from_revenuecat_not_the_request(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub()]]]);

        $this->withToken($token)->postJson('/users/me/subscription/sync', ['tier' => 'ignored'])
            ->assertOk()
            ->assertJsonPath('plan.tier', 'plus')
            ->assertJsonPath('plan.will_renew', true);

        $row = $this->entitlement($user);
        $this->assertSame('sync', $row->source);
        $this->assertSame('plus_monthly', $row->product_id);
        Http::assertSent(fn (Request $r) => $r->hasHeader('Authorization', 'Bearer sk_test')
            && str_contains($r->url(), "/customers/{$user->id}/subscriptions"));
    }

    public function test_sync_answers_503_when_revenuecat_is_unconfigured_or_down(): void
    {
        [, $token] = $this->user();
        Http::fake(['*' => Http::response([], 500)]);

        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertStatus(503);

        config(['services.revenuecat.secret_key' => '']);
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertStatus(503);
    }

    public function test_sync_is_rate_limited(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([]);

        for ($i = 0; $i < 10; $i++) {
            $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk();
        }
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertStatus(429);
    }

    // ── What counts ──────────────────────────────────────────────────────────

    public function test_sandbox_and_test_store_purchases_only_count_for_allowlisted_users(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [
            $this->sub(['environment' => 'sandbox']),
            $this->sub(['id' => 'sub_2', 'store' => 'test_store']),
        ]]]);

        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk()->assertJsonPath('plan.tier', 'free');
        $this->assertNull($this->entitlement($user));

        config(['entitlements.sandbox_user_ids' => [$user->id]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk()->assertJsonPath('plan.tier', 'plus');
    }

    public function test_an_owned_one_time_purchase_is_lifetime_until_refunded(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['purchases' => [$this->purchase()]]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')
            ->assertOk()->assertJsonPath('plan.is_lifetime', true);
        $this->assertSame('plus_lifetime', $this->entitlement($user)->product_id);

        $this->fakeRevenueCat([$user->id => ['purchases' => [$this->purchase(['status' => 'refunded'])]]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')
            ->assertOk()->assertJsonPath('plan.tier', 'free');
        $this->assertFalse($this->entitlement($user)->is_lifetime);
    }

    public function test_a_consumable_purchase_never_grants_lifetime(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['purchases' => [$this->purchase([], consumable: true)]]]);

        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk()->assertJsonPath('plan.tier', 'free');
    }

    public function test_billing_grace_keeps_access_while_revenuecat_says_so(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub([
            'status' => 'in_grace_period',
            'current_period_ends_at' => now()->subDay()->getTimestampMs(),
            'ends_at' => now()->subDay()->getTimestampMs(),
        ])]]]);

        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk()
            ->assertJsonPath('plan.tier', 'plus')
            ->assertJsonPath('plan.in_grace_period', true)
            ->assertJsonPath('plan.billing_issue', true);
    }

    public function test_access_ends_when_revenuecat_shows_none(): void
    {
        [$user, $token] = $this->user();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub()]]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertJsonPath('plan.tier', 'plus');

        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub(['gives_access' => false])]]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertJsonPath('plan.tier', 'free');

        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_an_older_webhook_event_cannot_undo_a_sync(): void
    {
        [$user, $token] = $this->user();
        $before = now()->subMinute()->getTimestampMs();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub()]]]);
        $this->withToken($token)->postJson('/users/me/subscription/sync')->assertOk();
        config(['services.revenuecat.webhook_auth' => $secret = 'Bearer '.str_repeat('s', 40)]);

        $this->postJson('/webhooks/revenuecat', ['event' => [
            'id' => (string) Str::uuid(), 'type' => 'EXPIRATION', 'event_timestamp_ms' => $before,
            'app_user_id' => $user->id, 'entitlement_ids' => ['plus'], 'environment' => 'PRODUCTION',
            'expiration_at_ms' => $before,
        ]], ['Authorization' => $secret])->assertOk()->assertJson(['status' => 'stale']);

        $this->assertTrue($this->entitlement($user)->isActive());
    }

    // ── Reconcile ────────────────────────────────────────────────────────────

    private function ledgerRow(string $type, string $status, array $links, array $payload = []): string
    {
        $id = (string) Str::uuid();
        RevenueCatEvent::query()->insert([
            'id' => $id, 'type' => $type, 'environment' => 'PRODUCTION',
            'event_timestamp_ms' => now()->subMinutes(10)->getTimestampMs(),
            'payload' => json_encode($payload + ['type' => $type, 'event_timestamp_ms' => now()->subMinutes(10)->getTimestampMs()]),
            'received_at' => now()->subMinutes(10), 'status' => $status,
        ]);
        foreach ($links as $role => $userId) {
            DB::table('revenuecat_event_users')->insert(['event_id' => $id, 'user_id' => $userId, 'role' => $role]);
        }

        return $id;
    }

    public function test_reconcile_reapplies_failed_events(): void
    {
        [$user] = $this->user();
        $id = $this->ledgerRow('INITIAL_PURCHASE', 'failed', ['app_user' => $user->id], [
            'entitlement_ids' => ['plus'], 'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
        ]);

        $this->artisan('subscriptions:reconcile')->assertSuccessful();

        $this->assertSame('applied', RevenueCatEvent::find($id)->status);
        $this->assertTrue($this->entitlement($user)->isActive());
    }

    public function test_reconcile_syncs_both_sides_of_a_transfer(): void
    {
        [$from] = $this->user();
        [$to] = $this->user();
        $this->fakeRevenueCat([$from->id => ['subscriptions' => [$this->sub()]]]);
        app(EntitlementSync::class)->sync($from);
        $this->assertTrue($this->entitlement($from)->isActive());

        // The purchase moved to the other account.
        $this->fakeRevenueCat([$to->id => ['subscriptions' => [$this->sub()]]]);
        $id = $this->ledgerRow('TRANSFER', 'needs_sync', ['transfer_from' => $from->id, 'transfer_to' => $to->id]);

        $this->artisan('subscriptions:reconcile')->assertSuccessful();

        $this->assertFalse($this->entitlement($from)->isActive());
        $this->assertTrue($this->entitlement($to)->isActive());
        $row = RevenueCatEvent::find($id);
        $this->assertSame('synced', $row->status);
        $this->assertNotNull($row->processed_at);
    }

    public function test_reconcile_leaves_sync_events_waiting_while_revenuecat_is_down(): void
    {
        [$user] = $this->user();
        Http::fake(['*' => Http::response([], 503)]);
        $id = $this->ledgerRow('PRODUCT_CHANGE', 'needs_sync', ['app_user' => $user->id]);

        $this->artisan('subscriptions:reconcile')->assertSuccessful();

        $row = RevenueCatEvent::find($id);
        $this->assertSame('needs_sync', $row->status);
        $this->assertNull($row->processed_at);
    }

    public function test_the_sweep_rechecks_billing_issues_and_prunes_old_events(): void
    {
        [$user] = $this->user();
        (new UserEntitlement)->forceFill([
            'user_id' => $user->id, 'entitlement' => 'plus', 'environment' => 'PRODUCTION',
            'expires_at' => now()->subDay(), 'grace_expires_at' => now()->addDays(10), 'billing_issue_at' => now(),
            'will_renew' => true, 'last_event_ms' => 1, 'last_event_type' => 'BILLING_ISSUE',
        ])->save();
        $this->fakeRevenueCat([$user->id => ['subscriptions' => [$this->sub()]]]); // payment went through
        $old = $this->ledgerRow('RENEWAL', 'applied', []);
        RevenueCatEvent::whereKey($old)->update(['processed_at' => now()->subDays(91), 'received_at' => now()->subDays(91)]);
        $recent = $this->ledgerRow('RENEWAL', 'applied', []);
        RevenueCatEvent::whereKey($recent)->update(['processed_at' => now()]);

        $this->artisan('subscriptions:reconcile --sweep')->assertSuccessful();

        $ent = $this->entitlement($user);
        $this->assertNull($ent->billing_issue_at);
        $this->assertNull($ent->grace_expires_at);
        $this->assertNull(RevenueCatEvent::find($old));
        $this->assertNotNull(RevenueCatEvent::find($recent));
    }

    // ── Account purge ────────────────────────────────────────────────────────

    private function dueForPurge(User $user, int $extraDays = 1): void
    {
        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + $extraDays),
        ])->save();
    }

    public function test_purge_deletes_the_revenuecat_customer(): void
    {
        [$user] = $this->user();
        $this->fakeRevenueCat([]);
        $this->dueForPurge($user);

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertNull(User::find($user->id));
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && $r->url() === self::RC.$user->id);
    }

    public function test_purge_waits_while_revenuecat_is_down_then_gives_up_after_the_retry_window(): void
    {
        [$user] = $this->user();
        Http::fake(['*' => Http::response([], 503)]);
        $this->dueForPurge($user);

        $this->artisan('accounts:purge-deleted')->assertSuccessful();
        $this->assertNotNull(User::find($user->id));

        $this->dueForPurge($user, 8); // past the 7-day third-party retry window
        $this->artisan('accounts:purge-deleted')->assertSuccessful();
        $this->assertNull(User::find($user->id));
    }
}
