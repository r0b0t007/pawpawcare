<?php

namespace Tests\Feature;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Subscriptions\EntitlementWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class RevenueCatWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'Bearer rc-webhook-test-secret-0123456789';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.revenuecat.webhook_auth' => self::SECRET]);
    }

    private function user(): User
    {
        return User::create([
            'name' => 'Sam',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
    }

    /** A RevenueCat-shaped event (see their sample payloads). */
    private function event(string $type, User|string|null $user, array $overrides = []): array
    {
        $now = now();

        return array_merge([
            'id' => (string) Str::uuid(),
            'type' => $type,
            'event_timestamp_ms' => $now->getTimestampMs(),
            'app_user_id' => $user instanceof User ? $user->id : $user,
            'original_app_user_id' => '$RCAnonymousID:8069238d6049ce87cc529853916d624c',
            'aliases' => ['$RCAnonymousID:8069238d6049ce87cc529853916d624c'],
            'product_id' => 'pawpawcare_plus_monthly',
            'entitlement_ids' => ['plus'],
            'period_type' => 'NORMAL',
            'purchased_at_ms' => $now->getTimestampMs(),
            'expiration_at_ms' => $now->copy()->addMonth()->getTimestampMs(),
            'environment' => 'PRODUCTION',
            'store' => 'APP_STORE',
            'subscriber_attributes' => ['$email' => ['value' => 'owner@example.com', 'updated_at_ms' => 1]],
        ], $overrides);
    }

    private function send(array $event, ?string $auth = self::SECRET)
    {
        return $this->postJson('/webhooks/revenuecat', ['event' => $event, 'api_version' => '1.0'],
            $auth === null ? [] : ['Authorization' => $auth]);
    }

    private function entitlement(User $user): ?UserEntitlement
    {
        return UserEntitlement::where('user_id', $user->id)->where('entitlement', 'plus')->first();
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    public function test_refuses_everything_when_not_configured(): void
    {
        config(['services.revenuecat.webhook_auth' => '']);

        $this->send($this->event('TEST', null), '')->assertStatus(503);
        $this->assertSame(0, RevenueCatEvent::count());
    }

    public function test_rejects_a_wrong_or_missing_authorization_header(): void
    {
        $this->send($this->event('TEST', null), 'Bearer wrong')->assertStatus(401);
        $this->send($this->event('TEST', null), null)->assertStatus(401);
        $this->assertSame(0, RevenueCatEvent::count());
    }

    public function test_rejects_a_malformed_payload(): void
    {
        $this->postJson('/webhooks/revenuecat', ['event' => ['type' => 'RENEWAL']], ['Authorization' => self::SECRET])
            ->assertStatus(422);
    }

    // ── Ledger ───────────────────────────────────────────────────────────────

    public function test_dashboard_test_event_is_acknowledged_and_logged(): void
    {
        $event = $this->event('TEST', null);

        $this->send($event)->assertOk()->assertJson(['status' => 'ignored']);

        $row = RevenueCatEvent::find($event['id']);
        $this->assertNotNull($row->processed_at);
        $this->assertSame(0, UserEntitlement::count());
    }

    public function test_subscriber_attributes_are_never_stored(): void
    {
        $event = $this->event('INITIAL_PURCHASE', $this->user());

        $this->send($event)->assertOk();

        $stored = RevenueCatEvent::find($event['id'])->getRawOriginal('payload');
        $this->assertStringNotContainsString('subscriber_attributes', $stored);
        $this->assertStringNotContainsString('owner@example.com', $stored);
    }

    public function test_a_redelivered_event_is_applied_once(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', $user);

        $this->send($event)->assertOk()->assertJson(['status' => 'applied']);
        $this->send($event)->assertOk()->assertJson(['status' => 'duplicate']);

        $this->assertSame(1, RevenueCatEvent::count());
        $this->assertSame(1, RevenueCatEvent::find($event['id'])->attempts);
    }

    // ── Entitlement state ───────────────────────────────────────────────────

    public function test_a_purchase_grants_the_entitlement(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', $user, ['period_type' => 'TRIAL', 'store' => 'PLAY_STORE']);

        $this->send($event)->assertOk();

        $ent = $this->entitlement($user);
        $this->assertTrue($ent->isActive());
        $this->assertTrue($ent->will_renew);
        $this->assertSame('PLAY_STORE', $ent->store);
        $this->assertSame('TRIAL', $ent->period_type);
        $this->assertSame('pawpawcare_plus_monthly', $ent->product_id);
        $this->assertSame(intdiv($event['expiration_at_ms'], 1000), $ent->expires_at->getTimestamp()); // stored to the second
        $this->assertSame((string) $user->id, RevenueCatEvent::find($event['id'])->user_id);
    }

    public function test_cancel_keeps_access_until_expiry_then_expiration_ends_it(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t]))->assertOk();

        $this->send($this->event('CANCELLATION', $user, ['event_timestamp_ms' => $t + 1000]))->assertOk();
        $ent = $this->entitlement($user);
        $this->assertTrue($ent->isActive());
        $this->assertFalse($ent->will_renew);
        $this->assertNotNull($ent->unsubscribed_at);

        $this->send($this->event('EXPIRATION', $user, [
            'event_timestamp_ms' => $t + 2000,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
        ]))->assertOk();
        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_uncancellation_and_renewal_restore_renewal_and_clear_billing_issues(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t]))->assertOk();
        $this->send($this->event('BILLING_ISSUE', $user, ['event_timestamp_ms' => $t + 1]))->assertOk();
        $this->assertNotNull($this->entitlement($user)->billing_issue_at);

        $this->send($this->event('RENEWAL', $user, ['event_timestamp_ms' => $t + 2]))->assertOk();
        $ent = $this->entitlement($user);
        $this->assertNull($ent->billing_issue_at);
        $this->assertTrue($ent->will_renew);
    }

    public function test_an_older_event_never_overwrites_a_newer_one(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('EXPIRATION', $user, [
            'event_timestamp_ms' => $t,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
        ]))->assertOk();

        // The purchase from earlier arrives late.
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t - 60_000]))
            ->assertOk()->assertJson(['status' => 'stale']);

        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_sandbox_purchases_are_honoured(): void
    {
        $user = $this->user();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['environment' => 'SANDBOX']))->assertOk();

        $this->assertSame('SANDBOX', $this->entitlement($user)->environment);
        $this->assertTrue($this->entitlement($user)->isActive());
    }

    // ── Users ────────────────────────────────────────────────────────────────

    public function test_the_user_can_be_found_through_an_alias(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', '$RCAnonymousID:abc', ['aliases' => ['$RCAnonymousID:abc', $user->id]]);

        $this->send($event)->assertOk()->assertJson(['status' => 'applied']);
        $this->assertNotNull($this->entitlement($user));
    }

    public function test_anonymous_or_unknown_users_change_nothing(): void
    {
        $anonymous = $this->event('INITIAL_PURCHASE', '$RCAnonymousID:abc');
        $unknownUuid = $this->event('INITIAL_PURCHASE', (string) Str::uuid());

        $this->send($anonymous)->assertOk()->assertJson(['status' => 'unknown_user']);
        $this->send($unknownUuid)->assertOk()->assertJson(['status' => 'unknown_user']);

        $this->assertSame(0, UserEntitlement::count());
        $this->assertNotNull(RevenueCatEvent::find($anonymous['id'])->processed_at);
    }

    // ── Left for the API sync / retry ───────────────────────────────────────

    public function test_transfers_are_left_for_the_api_sync(): void
    {
        $from = $this->user();
        $to = $this->user();
        $event = [
            'id' => (string) Str::uuid(),
            'type' => 'TRANSFER',
            'event_timestamp_ms' => now()->getTimestampMs(),
            'transferred_from' => [$from->id],
            'transferred_to' => [$to->id],
            'store' => 'APP_STORE',
            'environment' => 'PRODUCTION',
        ];

        $this->send($event)->assertOk()->assertJson(['status' => 'needs_sync']);

        $row = RevenueCatEvent::find($event['id']);
        $this->assertNull($row->processed_at);
        $this->assertSame('needs_sync', $row->error);
        $this->assertSame(0, UserEntitlement::count());
    }

    public function test_a_failure_while_applying_keeps_the_event_for_retry(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', $user);
        $this->mock(EntitlementWriter::class)->shouldReceive('process')->once()->andThrow(new \RuntimeException('db down'));

        $this->send($event)->assertOk()->assertJson(['status' => 'queued_for_retry']);

        $row = RevenueCatEvent::find($event['id']);
        $this->assertNull($row->processed_at);
        $this->assertStringContainsString('db down', $row->error);

        // RevenueCat redelivering an unprocessed event applies it then.
        $this->app->forgetInstance(EntitlementWriter::class);
        $this->app->offsetUnset(EntitlementWriter::class);
        $this->send($event)->assertOk()->assertJson(['status' => 'applied']);
        $this->assertTrue($this->entitlement($user)->isActive());
    }

    // ── Analytics ────────────────────────────────────────────────────────────

    public function test_subscription_analytics_use_the_event_id_for_dedupe(): void
    {
        config(['services.posthog.key' => 'phc_test', 'services.posthog.host' => 'https://us.i.posthog.com']);
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
        $user = $this->user();

        $this->send($this->event('INITIAL_PURCHASE', $user, ['environment' => 'SANDBOX']))->assertOk();

        Http::assertSent(function (Request $request) use ($user) {
            $e = $request->data()['batch'][0];

            return $e['event'] === 'server_subscription_started'
                && $e['properties']['distinct_id'] === (string) $user->id
                && $e['properties']['environment'] === 'sandbox'
                && isset($e['uuid'])
                && ! str_contains(json_encode($request->data()), 'owner@example.com');
        });
    }
}
