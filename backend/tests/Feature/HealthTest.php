<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use ErrorException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class HealthTest extends TestCase
{
    // No RefreshDatabase: /health needs no tables, and these tests break the
    // connection on purpose.

    private const DEGRADED = ['status' => 'degraded', 'version' => '1.0.0'];

    /** A multiple of 600, i.e. the start of a 10-minute block. */
    private const BLOCK_START = 1_800_000_000;

    private function probeDir(): string
    {
        return storage_path(HealthController::PROBE_DIR);
    }

    protected function tearDown(): void
    {
        File::isDirectory($this->probeDir()) ? File::deleteDirectory($this->probeDir()) : File::delete($this->probeDir());
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function breakDatabase(): void
    {
        config(['database.connections.sqlite.database' => storage_path('missing/dir/nope.sqlite')]);
        DB::purge('sqlite');
    }

    /** A file where the probe folder should be makes every probe write fail, as a full disk or inode quota does. */
    private function breakStorage(): void
    {
        File::deleteDirectory($this->probeDir());
        File::put($this->probeDir(), 'not a folder');
    }

    public function test_ok_when_everything_works_and_leaves_no_probe_files(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['status' => 'ok', 'version' => '1.0.0']);
        $this->getJson('/health')->assertOk();

        $this->assertDirectoryExists($this->probeDir());
        $this->assertSame([], File::allFiles($this->probeDir()));
    }

    public function test_degraded_without_saying_why_when_the_database_is_unreachable(): void
    {
        $this->breakDatabase();

        $this->getJson('/health')->assertStatus(503)->assertExactJson(self::DEGRADED);
    }

    public function test_degraded_without_saying_why_when_storage_cannot_be_written(): void
    {
        $this->breakStorage();

        $this->getJson('/health')->assertStatus(503)->assertExactJson(self::DEGRADED);
    }

    public function test_the_failing_check_is_logged_once_per_window(): void
    {
        Log::spy();
        $this->breakDatabase();

        $this->getJson('/health')->assertStatus(503);
        $this->getJson('/health')->assertStatus(503);

        Log::shouldHaveReceived('error')->with('Health check degraded: database')->once();
    }

    public function test_with_the_cache_on_the_broken_disk_the_database_cache_keeps_the_marker(): void
    {
        $this->artisan('migrate', ['--path' => 'database/migrations/0001_01_01_000001_create_cache_table.php']);
        config(['cache.default' => 'file']);
        $this->breakStorage();

        Carbon::setTestNow(Carbon::createFromTimestamp(self::BLOCK_START + 300));
        Log::shouldReceive('channel')->with('sentry')->once()->andReturnSelf();
        Log::shouldReceive('error')->with('Health check degraded: storage')->once();

        $this->getJson('/health')->assertStatus(503);
        $this->getJson('/health')->assertStatus(503);
    }

    public function test_with_nowhere_to_keep_the_marker_it_logs_to_sentry_in_the_first_minute_of_each_block(): void
    {
        // File cache on the broken disk, and no cache table for the fallback.
        config(['cache.default' => 'file']);
        $this->breakStorage();

        Carbon::setTestNow(Carbon::createFromTimestamp(self::BLOCK_START + 10));
        Log::shouldReceive('channel')->with('sentry')->once()->andReturnSelf();
        Log::shouldReceive('error')->with('Health check degraded: storage')->once();
        $this->getJson('/health')->assertStatus(503);

        Carbon::setTestNow(Carbon::createFromTimestamp(self::BLOCK_START + 300));
        $this->getJson('/health')->assertStatus(503);
    }

    public function test_a_logging_failure_still_answers_503(): void
    {
        Log::shouldReceive('error')->andThrow(new ErrorException('file_put_contents(): No space left on device'));
        $this->breakDatabase();

        $this->getJson('/health')->assertStatus(503)->assertExactJson(self::DEGRADED);
    }

    public function test_a_broken_rate_limiter_does_not_turn_the_check_into_a_500(): void
    {
        RateLimiter::shouldReceive('tooManyAttempts')->andThrow(new ErrorException('No space left on device'));

        $this->getJson('/health')->assertOk();
    }

    public function test_rate_limited_per_ip(): void
    {
        for ($i = 0; $i < HealthController::PER_MINUTE; $i++) {
            $this->getJson('/health')->assertOk();
        }

        $this->getJson('/health')->assertStatus(429);
    }

    public function test_an_ipv6_64_shares_one_bucket(): void
    {
        for ($i = 1; $i <= HealthController::PER_MINUTE; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "2001:db8::{$i}"])->getJson('/health')->assertOk();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '2001:db8::ffff'])->getJson('/health')->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '2001:db8:0:1::1'])->getJson('/health')->assertOk();
    }
}
