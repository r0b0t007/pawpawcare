<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Mockery;
use Sentry\SentrySdk;
use Sentry\State\Hub;
use Sentry\State\HubInterface;
use Sentry\State\Scope;
use Tests\TestCase;

class SentryReportingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::get('/__test/boom', fn () => throw new \RuntimeException('unexpected failure'));
        Route::get('/__test/not-found', fn () => abort(404, 'No such pet'));
        Route::get('/__test/server-abort', fn () => abort(503, 'Signing key not configured'));
        Route::post('/__test/invalid', fn () => request()->validate(['name' => 'required']));
    }

    protected function tearDown(): void
    {
        SentrySdk::setCurrentHub(new Hub);
        parent::tearDown();
    }

    /** A mock hub used both by Integration::handles() and the `sentry` log channel. */
    private function mockHub(): Mockery\MockInterface
    {
        $hub = Mockery::mock(HubInterface::class)->shouldIgnoreMissing();
        // The log handler captures inside withScope(); run the callback so a
        // capture made there is actually seen by the expectations.
        $hub->shouldReceive('withScope')->andReturnUsing(fn (callable $callback) => $callback(new Scope));
        SentrySdk::setCurrentHub($hub);
        $this->app->instance('sentry', $hub);
        $this->app->instance(HubInterface::class, $hub);

        return $hub;
    }

    public function test_unexpected_exceptions_are_reported(): void
    {
        $this->mockHub()->shouldReceive('captureException')->once();

        $this->getJson('/__test/boom')->assertStatus(500);
    }

    public function test_4xx_aborts_and_validation_errors_are_not_reported(): void
    {
        $this->mockHub()->shouldReceive('captureException')->never();

        $this->getJson('/__test/not-found')->assertStatus(404)->assertJson(['detail' => 'No such pet']);
        $this->postJson('/__test/invalid', [])->assertStatus(422);
    }

    public function test_5xx_aborts_are_reported_but_throttled_per_message(): void
    {
        // A misconfiguration (e.g. social login, extraction provider) aborts
        // every request: report it, but once per 10 minutes, not per request.
        Route::get('/__test/other-abort', fn () => abort(502, 'Extraction provider failed'));
        $this->mockHub()->shouldReceive('captureException')->twice();

        $this->getJson('/__test/server-abort')->assertStatus(503);
        $this->getJson('/__test/server-abort')->assertStatus(503);
        $this->getJson('/__test/server-abort')->assertStatus(503);
        $this->getJson('/__test/other-abort')->assertStatus(502);
    }

    public function test_exceptions_are_not_captured_twice_through_the_sentry_log_stack(): void
    {
        // Production runs LOG_STACK=single,sentry: Laravel logs every reported
        // exception through the stack, and the `sentry` channel must not
        // capture it a second time (report_exceptions=false).
        config([
            'logging.default' => 'stack',
            'logging.channels.stack.channels' => ['single', 'sentry'],
        ]);
        $hub = $this->mockHub();
        $hub->shouldReceive('captureException')->once();
        $hub->shouldReceive('captureMessage')->never();
        $hub->shouldReceive('captureEvent')->never();

        $this->getJson('/__test/boom')->assertStatus(500);
    }

    public function test_authenticated_requests_tag_only_the_user_id(): void
    {
        SentrySdk::setCurrentHub(new Hub);
        $user = User::create([
            'name' => 'Owner Name',
            'email' => 'owner@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        $this->withToken(JwtService::createAccessToken($user->id))->getJson('/users/me')->assertOk();

        $tagged = null;
        SentrySdk::getCurrentHub()->configureScope(function (Scope $scope) use (&$tagged) {
            $tagged = $scope->getUser();
        });
        $this->assertNotNull($tagged);
        $this->assertSame((string) $user->id, (string) $tagged->getId());
        $this->assertNull($tagged->getEmail());
        $this->assertNull($tagged->getUsername());
    }
}
