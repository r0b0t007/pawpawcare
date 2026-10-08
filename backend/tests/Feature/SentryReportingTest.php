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

    private function expectCaptures(int $times): void
    {
        $hub = Mockery::mock(HubInterface::class)->shouldIgnoreMissing();
        $hub->shouldReceive('captureException')->times($times);
        SentrySdk::setCurrentHub($hub);
    }

    public function test_unexpected_exceptions_are_reported(): void
    {
        $this->expectCaptures(1);

        $this->getJson('/__test/boom')->assertStatus(500);
    }

    public function test_aborts_and_validation_errors_are_not_reported(): void
    {
        $this->expectCaptures(0);

        $this->getJson('/__test/not-found')->assertStatus(404)->assertJson(['detail' => 'No such pet']);
        $this->getJson('/__test/server-abort')->assertStatus(503);
        $this->postJson('/__test/invalid', [])->assertStatus(422);
    }

    public function test_sentry_log_channel_does_not_recapture_exceptions(): void
    {
        // Integration::handles() already reports unhandled exceptions; the
        // `sentry` log channel (LOG_STACK=single,sentry) must not send them again.
        $this->assertSame('sentry', config('logging.channels.sentry.driver'));
        $this->assertFalse(config('logging.channels.sentry.report_exceptions'));
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
