<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class ProductAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private function configure(array $overrides = []): void
    {
        config(['services.posthog' => array_merge([
            'key' => 'phc_test',
            'host' => 'https://us.i.posthog.com',
            'api_host' => 'https://us.posthog.com',
            'personal_api_key' => 'phx_test',
            'project_id' => '123',
        ], $overrides)]);
    }

    private function user(array $attrs = []): User
    {
        $user = User::create([
            'name' => 'Sam Owner',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
        if ($attrs) {
            $user->forceFill($attrs)->save();
        }

        return $user;
    }

    public function test_disabled_without_a_project_key(): void
    {
        $this->configure(['key' => '']);
        Http::fake();
        $analytics = new ProductAnalytics;

        $analytics->capture($this->user(), 'server_records_exported');
        $analytics->flush();

        Http::assertNothingSent();
    }

    public function test_opted_out_users_are_never_captured(): void
    {
        $this->configure();
        Http::fake();
        $analytics = new ProductAnalytics;

        $analytics->capture($this->user(['analytics_opt_out' => true]), 'server_records_exported');
        $analytics->flush();

        Http::assertNothingSent();
    }

    public function test_events_are_batched_with_the_user_id_only_and_geoip_off(): void
    {
        $this->configure();
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
        $analytics = new ProductAnalytics;
        $user = $this->user();

        $analytics->capture($user, 'server_records_exported', ['format' => 'pdf', 'pet_count' => 2]);
        $analytics->capture($user, 'server_share_link_created', ['expires_in' => '24h']);
        $analytics->flush();

        Http::assertSentCount(1);
        Http::assertSent(function (Request $request) use ($user) {
            $body = $request->data();
            $first = $body['batch'][0];

            return $request->url() === 'https://us.i.posthog.com/batch/'
                && $body['api_key'] === 'phc_test'
                && count($body['batch']) === 2
                && $first['event'] === 'server_records_exported'
                && $first['properties']['distinct_id'] === (string) $user->id
                && $first['properties']['$geoip_disable'] === true
                && $first['properties']['format'] === 'pdf'
                // no PII leaks in, whatever the caller does
                && ! str_contains(json_encode($body), $user->email)
                && ! str_contains(json_encode($body), 'Sam Owner');
        });
    }

    public function test_events_are_flushed_after_the_response(): void
    {
        $this->configure();
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);

        app(ProductAnalytics::class)->capture($this->user(), 'server_invite_accepted');
        Http::assertNothingSent();

        $this->app->terminate();

        Http::assertSentCount(1);
    }

    public function test_a_dedupe_key_gives_a_stable_event_uuid(): void
    {
        $this->configure();
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
        $analytics = new ProductAnalytics;
        $user = $this->user();

        $analytics->capture($user, 'server_subscription_started', [], 'evt_123');
        $analytics->capture($user, 'server_subscription_started', [], 'evt_123');
        $analytics->capture($user, 'server_subscription_started');
        $analytics->flush();

        Http::assertSent(function (Request $request) {
            [$a, $b, $c] = $request->data()['batch'];

            return isset($a['uuid']) && $a['uuid'] === $b['uuid'] && ! isset($c['uuid']);
        });
    }

    public function test_a_failed_capture_is_logged_and_never_thrown(): void
    {
        $this->configure();
        Http::fake(['us.i.posthog.com/*' => Http::response('down', 503)]);
        Log::spy();
        $analytics = new ProductAnalytics;

        $analytics->capture($this->user(), 'server_records_exported');
        $analytics->flush();

        Log::shouldHaveReceived('warning')->once()->withArgs(fn ($message) => $message === 'PostHog capture failed');
    }

    public function test_delete_person_queues_the_person_and_their_events(): void
    {
        $this->configure();
        Http::fake(['us.posthog.com/*' => Http::response(['persons_found' => 1, 'persons_queued_for_deletion' => 1, 'deletion_errors' => []], 202)]);

        $this->assertSame(ProductAnalytics::DELETE_OK, (new ProductAnalytics)->deletePerson('user-uuid'));

        Http::assertSent(fn (Request $request) => $request->url() === 'https://us.posthog.com/api/projects/123/persons/bulk_delete/'
            && $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Bearer phx_test')
            && $request->data() === ['distinct_ids' => ['user-uuid'], 'delete_events' => true, 'delete_recordings' => true]);
    }

    public function test_delete_person_with_nothing_tracked_succeeds(): void
    {
        $this->configure();
        Http::fake(['us.posthog.com/*' => Http::response(['persons_found' => 0, 'deletion_errors' => []], 202)]);

        $this->assertSame(ProductAnalytics::DELETE_OK, (new ProductAnalytics)->deletePerson('never-tracked'));
    }

    public function test_delete_person_classifies_failures(): void
    {
        $this->configure();
        Http::fakeSequence('us.posthog.com/*')
            ->push(['deletion_errors' => [['person_uuid' => 'x', 'step' => 'person']]], 202)
            ->push('oops', 500)
            ->push('slow down', 429)
            ->pushFailedConnection();
        $analytics = new ProductAnalytics;

        $this->assertSame(ProductAnalytics::DELETE_PERSON_FAILED, $analytics->deletePerson('a'), 'deletion_errors in a 202');
        $this->assertSame(ProductAnalytics::DELETE_UNAVAILABLE, $analytics->deletePerson('a'), '5xx');
        $this->assertSame(ProductAnalytics::DELETE_UNAVAILABLE, $analytics->deletePerson('a'), '429');
        $this->assertSame(ProductAnalytics::DELETE_UNAVAILABLE, $analytics->deletePerson('a'), 'network');
    }

    public function test_a_rejected_key_or_project_is_an_error_right_away(): void
    {
        $this->configure();
        Http::fake(['us.posthog.com/*' => Http::response(['detail' => 'forbidden'], 403)]);
        Log::spy();

        $this->assertSame(ProductAnalytics::DELETE_UNAVAILABLE, (new ProductAnalytics)->deletePerson('a'));
        Log::shouldHaveReceived('error')->once()->withArgs(fn ($message) => str_contains($message, 'person:write'));
    }

    public function test_deletion_still_runs_when_server_capture_is_off(): void
    {
        // The app identifies users under the same id even if the server
        // never captures, so erasure can't depend on the capture key.
        $this->configure(['key' => '']);
        Http::fake(['us.posthog.com/*' => Http::response(['deletion_errors' => []], 202)]);

        $this->assertSame(ProductAnalytics::DELETE_OK, (new ProductAnalytics)->deletePerson('a'));
        Http::assertSentCount(1);
    }

    public function test_unconfigured_deletion_is_a_no_op_outside_production(): void
    {
        $this->configure(['personal_api_key' => '', 'project_id' => '']);
        Http::fake();

        $this->assertSame(ProductAnalytics::DELETE_OK, (new ProductAnalytics)->deletePerson('a'));
        Http::assertNothingSent();
    }

    public function test_unconfigured_deletion_fails_loudly_in_production(): void
    {
        $this->configure(['personal_api_key' => '']);
        $this->app['env'] = 'production';
        Http::fake();
        Log::spy();

        $this->assertSame(ProductAnalytics::DELETE_UNAVAILABLE, (new ProductAnalytics)->deletePerson('a'));
        Http::assertNothingSent();
        Log::shouldHaveReceived('error')->once();
    }
}
