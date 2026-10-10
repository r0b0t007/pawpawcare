<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class HealthTest extends TestCase
{
    // No RefreshDatabase: /health needs no tables, and these tests break the
    // connection on purpose.

    private function probeDir(): string
    {
        return storage_path(HealthController::PROBE_DIR);
    }

    protected function tearDown(): void
    {
        File::isDirectory($this->probeDir()) ? File::deleteDirectory($this->probeDir()) : File::delete($this->probeDir());
        parent::tearDown();
    }

    private function breakDatabase(): void
    {
        config(['database.connections.sqlite.database' => storage_path('missing/dir/nope.sqlite')]);
        DB::purge('sqlite');
    }

    public function test_ok_when_everything_works_and_leaves_no_probe_files(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['status' => 'ok', 'version' => '1.0.0']);
        $this->getJson('/health')->assertOk();

        $this->assertDirectoryExists($this->probeDir());
        $this->assertSame([], File::allFiles($this->probeDir()));
    }

    public function test_degraded_when_the_database_is_unreachable(): void
    {
        $this->breakDatabase();

        $this->getJson('/health')->assertStatus(503)->assertExactJson(['status' => 'degraded', 'version' => '1.0.0']);
    }

    public function test_degraded_when_storage_cannot_be_written(): void
    {
        // A file where the probe folder should be makes every probe write
        // fail, as a full disk or inode quota does.
        File::deleteDirectory($this->probeDir());
        File::put($this->probeDir(), 'not a folder');

        $this->getJson('/health')->assertStatus(503)->assertJson(['status' => 'degraded']);
    }

    public function test_the_failing_check_is_never_returned(): void
    {
        $this->breakDatabase();

        $body = $this->getJson('/health')->getContent();
        $this->assertStringNotContainsString('database', $body);
    }

    public function test_health_has_its_own_rate_limit_counter(): void
    {
        $route = collect(app('router')->getRoutes())->first(fn ($r) => $r->uri() === 'health');

        $this->assertContains('throttle:60,1,health', $route->gatherMiddleware());
    }
}
