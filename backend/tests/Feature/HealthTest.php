<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class HealthTest extends TestCase
{
    // No RefreshDatabase: /health needs no tables, and these tests break the
    // connection on purpose.

    protected function tearDown(): void
    {
        $probe = storage_path(HealthController::PROBE_FILE);
        if (File::isDirectory($probe)) {
            File::deleteDirectory($probe);
        }
        parent::tearDown();
    }

    public function test_ok_when_everything_works(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['status' => 'ok', 'version' => '1.0.0']);
        $this->assertFileExists(storage_path(HealthController::PROBE_FILE));
    }

    public function test_degraded_when_the_database_is_unreachable(): void
    {
        Log::spy();
        config(['database.connections.sqlite.database' => storage_path('missing/dir/nope.sqlite')]);
        DB::purge('sqlite');

        $this->getJson('/health')->assertStatus(503)->assertExactJson(['status' => 'degraded', 'version' => '1.0.0']);
        Log::shouldHaveReceived('log')->with('error', 'Health check degraded: database')->once();
    }

    public function test_degraded_when_storage_cannot_be_written(): void
    {
        // A directory where the probe file should go makes every write fail,
        // like a full disk quota does.
        File::delete(storage_path(HealthController::PROBE_FILE));
        File::ensureDirectoryExists(storage_path(HealthController::PROBE_FILE));

        $this->getJson('/health')->assertStatus(503)->assertJson(['status' => 'degraded']);
    }

    public function test_the_failing_check_is_never_returned(): void
    {
        config(['database.connections.sqlite.database' => storage_path('missing/dir/nope.sqlite')]);
        DB::purge('sqlite');

        $body = $this->getJson('/health')->getContent();
        $this->assertStringNotContainsString('database', $body);
    }
}
