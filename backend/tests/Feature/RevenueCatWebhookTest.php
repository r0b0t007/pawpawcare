<?php

namespace Tests\Feature;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Analytics\ProductAnalytics;
use App\Services\Subscriptions\EntitlementWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
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

    public function test_refuses_everything_with_a_guessable_secret(): void
    {
        config(['services.revenuecat.webhook_auth' => 'short-secret']);

        $this->send($this->event('TEST', null), 'short-secret')->assertStatus(503);
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

    public function test_only_the_needed_event_fields_are_stored(): void
    {
        $event = $this->event('INITIAL_PURCHASE', $this->user(), [
            'country_code' => 'DE',
            'price' => 8.14,
            'transaction_id' => '123456789012345',
            'some_future_field' => 'x',
        ]);

        $this->send($event)->assertOk();

        $stored = RevenueCatEvent::find($event['id'])->payload;
        foreach (['subscriber_attributes', 'country_code', 'price', 'transaction_id', 'some_future_field'] as $field) {
            $this->assertArrayNotHasKey($field, $stored);
        }
        $this->assertStringNotContainsString('owner@example.com', json_encode($stored));
        $this->assertSame(['plus'], $stored['entitlement_ids']);
    }

    public function test_a_redelivered_event_is_applied_once(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', $user);

        $this->send($event)->assertOk()->assertJson(['status' => 'applied']);
        $this->send($event)->assertOk()->assertJson(['status' => 'duplicate']);
        $this->assertSame('applied', RevenueCatEvent::find($event['id'])->status);

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
        $this->assertSame('needs_sync', $row->status);
        $this->assertNull($row->error);
        $this->assertSame(0, UserEntitlement::count());
    }

    public function test_a_failure_while_applying_keeps_the_event_for_retry(): void
    {
        $user = $this->user();
        $event = $this->event('INITIAL_PURCHASE', $user);
        $this->mock(EntitlementWriter::class)->shouldReceive('process')->once()->andThrow(new \RuntimeException('db down'));

        // Non-2xx so RevenueCat redelivers it.
        $this->send($event)->assertStatus(500)->assertJson(['status' => 'retry']);

        $row = RevenueCatEvent::find($event['id']);
        $this->assertNull($row->processed_at);
        $this->assertSame('failed', $row->status);
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

    // ── Erasure ──────────────────────────────────────────────────────────────

    public function test_purging_the_account_removes_its_subscription_records(): void
    {
        $user = $this->user();
        $this->send($this->event('INITIAL_PURCHASE', $user))->assertOk();
        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + 1),
        ])->save();

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertSame(0, RevenueCatEvent::where('user_id', $user->id)->count());
        $this->assertSame(0, UserEntitlement::where('user_id', $user->id)->count());
    }

    // ── Code-review fixes ────────────────────────────────────────────────────

    public function test_plan_changes_are_left_for_the_api_sync(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t, 'product_id' => 'plus_yearly']))->assertOk();

        $this->send($this->event('PRODUCT_CHANGE', $user, [
            'event_timestamp_ms' => $t + 1000,
            'product_id' => 'plus_yearly',
            'new_product_id' => 'plus_monthly',
        ]))->assertOk()->assertJson(['status' => 'needs_sync']);

        // The yearly plan is still what's running until RevenueCat says otherwise.
        $this->assertSame('plus_yearly', $this->entitlement($user)->product_id);
    }

    public function test_each_event_only_changes_what_it_means(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t]))->assertOk();
        $this->send($this->event('CANCELLATION', $user, ['event_timestamp_ms' => $t + 1]))->assertOk();
        $this->send($this->event('BILLING_ISSUE', $user, ['event_timestamp_ms' => $t + 2]))->assertOk();

        // A support extension moves the expiry only.
        $this->send($this->event('SUBSCRIPTION_EXTENDED', $user, [
            'event_timestamp_ms' => $t + 3,
            'expiration_at_ms' => now()->addYear()->getTimestampMs(),
        ]))->assertOk();
        $ent = $this->entitlement($user);
        $this->assertFalse($ent->will_renew);
        $this->assertNotNull($ent->unsubscribed_at);
        $this->assertNotNull($ent->billing_issue_at);

        // Un-cancelling turns renewal back on but doesn't fix the payment.
        $this->send($this->event('UNCANCELLATION', $user, ['event_timestamp_ms' => $t + 4]))->assertOk();
        $ent = $this->entitlement($user);
        $this->assertTrue($ent->will_renew);
        $this->assertNull($ent->unsubscribed_at);
        $this->assertNotNull($ent->billing_issue_at);
    }

    public function test_expiry_dates_after_2038_are_stored(): void
    {
        $user = $this->user();
        $farFuture = Carbon::create(2099, 1, 1)->getTimestampMs();

        $this->send($this->event('TEMPORARY_ENTITLEMENT_GRANT', $user, ['expiration_at_ms' => $farFuture]))->assertOk();

        $this->assertSame(2099, $this->entitlement($user)->expires_at->year);
    }

    public function test_different_events_at_the_same_instant_are_left_for_the_sync(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('RENEWAL', $user, ['event_timestamp_ms' => $t]))->assertOk();

        $this->send($this->event('BILLING_ISSUE', $user, ['event_timestamp_ms' => $t]))
            ->assertOk()->assertJson(['status' => 'needs_sync']);

        $this->assertNull($this->entitlement($user)->billing_issue_at);
    }

    public function test_an_event_missing_from_the_ledger_is_a_failure_not_a_crash(): void
    {
        $this->expectException(\RuntimeException::class);

        app(EntitlementWriter::class)->process('never-recorded');
    }

    public function test_events_for_unknown_customers_keep_no_identifiers(): void
    {
        $orphanId = (string) Str::uuid(); // e.g. an account already purged
        $event = $this->event('EXPIRATION', $orphanId, ['aliases' => [$orphanId, '$RCAnonymousID:x']]);

        $this->send($event)->assertOk()->assertJson(['status' => 'unknown_user']);

        $stored = RevenueCatEvent::find($event['id'])->payload;
        foreach (['app_user_id', 'original_app_user_id', 'aliases'] as $field) {
            $this->assertArrayNotHasKey($field, $stored);
        }
        $this->assertStringNotContainsString($orphanId, json_encode($stored));
    }

    public function test_the_ledger_never_stores_customer_ids_and_purge_unlinks_everything(): void
    {
        $user = $this->user();
        $other = $this->user();
        $purchase = $this->event('INITIAL_PURCHASE', $user, ['aliases' => [$user->id, '$RCAnonymousID:x']]);
        $transfer = [
            'id' => (string) Str::uuid(),
            'type' => 'TRANSFER',
            'event_timestamp_ms' => now()->getTimestampMs(),
            'transferred_from' => [$user->id],
            'transferred_to' => [$other->id],
        ];
        $this->send($purchase)->assertOk();
        $this->send($transfer)->assertOk();
        $this->send($this->event('INITIAL_PURCHASE', $other))->assertOk();

        // Who an event is about lives only in the link table.
        foreach (RevenueCatEvent::all() as $row) {
            $this->assertStringNotContainsString((string) $user->id, json_encode($row->payload));
            $this->assertStringNotContainsString((string) $other->id, json_encode($row->payload));
        }
        $this->assertSame(['alias', 'app_user'], DB::table('revenuecat_event_users')
            ->where('event_id', $purchase['id'])->orderBy('role')->pluck('role')->all());
        $this->assertSame(1, DB::table('revenuecat_event_users')
            ->where(['event_id' => $transfer['id'], 'user_id' => $user->id, 'role' => 'transfer_from'])->count());

        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + 1),
        ])->save();
        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertSame(0, DB::table('revenuecat_event_users')->where('user_id', $user->id)->count());
        $this->assertSame(0, RevenueCatEvent::where('user_id', $user->id)->count());
        $this->assertNotNull(RevenueCatEvent::find($purchase['id'])); // kept, anonymous
        $this->assertSame(2, DB::table('revenuecat_event_users')->where('user_id', $other->id)->count()); // others untouched
    }

    public function test_any_event_matching_no_account_keeps_no_identifiers(): void
    {
        $gone = (string) Str::uuid(); // e.g. purged earlier
        $info = $this->event('INVOICE_ISSUANCE', $gone, ['aliases' => [$gone]]);
        $transfer = [
            'id' => (string) Str::uuid(),
            'type' => 'TRANSFER',
            'event_timestamp_ms' => now()->getTimestampMs(),
            'transferred_from' => [$gone],
            'transferred_to' => ['$RCAnonymousID:x'],
        ];

        $this->send($info)->assertOk()->assertJson(['status' => 'ignored']);
        $this->send($transfer)->assertOk()->assertJson(['status' => 'unknown_user']);

        foreach ([$info['id'], $transfer['id']] as $id) {
            $this->assertStringNotContainsString($gone, json_encode(RevenueCatEvent::find($id)->payload));
        }
    }

    public function test_transfer_ids_only_identify_the_user_on_transfer_events(): void
    {
        $victim = $this->user();
        $event = $this->event('INITIAL_PURCHASE', '$RCAnonymousID:abc', ['transferred_to' => [$victim->id]]);

        $this->send($event)->assertOk()->assertJson(['status' => 'unknown_user']);

        $this->assertNull($this->entitlement($victim));
    }

    public function test_a_revoking_first_event_never_creates_lifetime_access(): void
    {
        $user = $this->user();
        $withoutExpiry = $this->event('BILLING_ISSUE', $user);
        unset($withoutExpiry['expiration_at_ms']);

        $this->send($withoutExpiry)->assertOk()->assertJson(['status' => 'applied']);
        $this->assertFalse($this->entitlement($user)->isActive());

        // Nor does a later event with a null expiry erase a real one.
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => now()->getTimestampMs() + 1000]))->assertOk();
        $this->send($this->event('EXPIRATION', $user, [
            'event_timestamp_ms' => now()->getTimestampMs() + 2000,
            'expiration_at_ms' => null,
        ]))->assertOk();
        $ent = $this->entitlement($user);
        $this->assertFalse($ent->is_lifetime);
        $this->assertNotNull($ent->expires_at);
    }

    public function test_a_lifetime_purchase_is_active_until_refunded(): void
    {
        $user = $this->user();
        $t = now()->subMinutes(5)->getTimestampMs();
        $this->send($this->event('NON_RENEWING_PURCHASE', $user, ['event_timestamp_ms' => $t, 'expiration_at_ms' => null]))->assertOk();
        $this->assertTrue($this->entitlement($user)->is_lifetime);
        $this->assertTrue($this->entitlement($user)->isActive());

        $this->send($this->event('CANCELLATION', $user, [
            'event_timestamp_ms' => $t + 1000,
            'expiration_at_ms' => null,
            'cancel_reason' => 'CUSTOMER_SUPPORT',
        ]))->assertOk();

        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_a_billing_grace_period_keeps_access(): void
    {
        $user = $this->user();
        $t = now()->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t]))->assertOk();

        $this->send($this->event('BILLING_ISSUE', $user, [
            'event_timestamp_ms' => $t + 1000,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
            'grace_period_expiration_at_ms' => now()->addDays(16)->getTimestampMs(),
        ]))->assertOk();
        $this->assertTrue($this->entitlement($user)->isActive());

        $this->send($this->event('EXPIRATION', $user, [
            'event_timestamp_ms' => $t + 2000,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
        ]))->assertOk();
        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_analytics_are_only_sent_for_committed_changes_at_the_event_time(): void
    {
        config(['services.posthog.key' => 'phc_test', 'services.posthog.host' => 'https://us.i.posthog.com']);
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
        $user = $this->user();
        $eventTime = now()->subDays(2)->startOfSecond();
        $event = $this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $eventTime->getTimestampMs()]);
        RevenueCatEvent::query()->insert([
            'id' => $event['id'], 'type' => $event['type'], 'event_timestamp_ms' => $event['event_timestamp_ms'],
            'payload' => json_encode(['type' => $event['type'], 'event_timestamp_ms' => $event['event_timestamp_ms'], 'entitlement_ids' => ['plus']]),
            'received_at' => now(),
        ]);
        DB::table('revenuecat_event_users')->insert(['event_id' => $event['id'], 'user_id' => $user->id, 'role' => 'app_user']);
        $analytics = app(ProductAnalytics::class);

        // Rolled back: nothing is sent.
        DB::beginTransaction();
        app(EntitlementWriter::class)->process($event['id']);
        DB::rollBack();
        $analytics->flush();
        Http::assertNothingSent();

        // Committed: sent once, stamped with the event's own time.
        app(EntitlementWriter::class)->process($event['id']);
        $analytics->flush();
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => $r->data()['batch'][0]['timestamp'] === $eventTime->toIso8601ZuluString('millisecond'));
    }

    public function test_an_unconfigured_webhook_is_not_reported_as_an_error(): void
    {
        config(['services.revenuecat.webhook_auth' => '']);
        Exceptions::fake();

        $this->send($this->event('TEST', null))->assertStatus(503);

        Exceptions::assertNothingReported();
    }

    public function test_events_for_another_product_never_shorten_a_lifetime_purchase(): void
    {
        $user = $this->user();
        $t = now()->subMinutes(5)->getTimestampMs();
        $this->send($this->event('NON_RENEWING_PURCHASE', $user, [
            'event_timestamp_ms' => $t, 'product_id' => 'plus_lifetime', 'expiration_at_ms' => null,
        ]))->assertOk();

        // Turning off the old monthly plan's auto-renew, then it expiring.
        $this->send($this->event('CANCELLATION', $user, [
            'event_timestamp_ms' => $t + 1000, 'product_id' => 'plus_monthly',
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
        ]))->assertOk()->assertJson(['status' => 'ignored']);

        $ent = $this->entitlement($user);
        $this->assertTrue($ent->is_lifetime);
        $this->assertTrue($ent->isActive());
    }

    public function test_a_non_null_junk_expiry_never_grants_lifetime(): void
    {
        $user = $this->user();

        $this->send($this->event('NON_RENEWING_PURCHASE', $user, ['expiration_at_ms' => 0]))->assertOk();

        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_a_refund_during_the_grace_period_ends_access(): void
    {
        $user = $this->user();
        $t = now()->subMinutes(5)->getTimestampMs();
        $this->send($this->event('INITIAL_PURCHASE', $user, ['event_timestamp_ms' => $t]))->assertOk();
        $this->send($this->event('BILLING_ISSUE', $user, [
            'event_timestamp_ms' => $t + 1000,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
            'grace_period_expiration_at_ms' => now()->addDays(16)->getTimestampMs(),
        ]))->assertOk();

        $this->send($this->event('CANCELLATION', $user, [
            'event_timestamp_ms' => $t + 2000,
            'expiration_at_ms' => now()->subMinute()->getTimestampMs(),
            'cancel_reason' => 'CUSTOMER_SUPPORT',
        ]))->assertOk();

        $this->assertFalse($this->entitlement($user)->isActive());
    }

    public function test_an_event_naming_two_of_our_accounts_is_left_for_the_sync(): void
    {
        $a = $this->user();
        $b = $this->user();

        $this->send($this->event('INITIAL_PURCHASE', '$RCAnonymousID:x', ['aliases' => [$a->id, $b->id]]))
            ->assertOk()->assertJson(['status' => 'needs_sync']);

        $this->assertSame(0, UserEntitlement::count());
    }

    public function test_no_analytics_for_an_account_pending_deletion(): void
    {
        config(['services.posthog.key' => 'phc_test', 'services.posthog.host' => 'https://us.i.posthog.com']);
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
        $user = $this->user();
        $user->forceFill(['deletion_requested_at' => now()])->save();

        $this->send($this->event('CANCELLATION', $user))->assertOk();
        app(ProductAnalytics::class)->flush();

        Http::assertNothingSent();
    }
}
