<?php

namespace App\Http\Controllers;

use App\Support\JwtSecretGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use PDO;

/**
 * GET /health — what the Sentry uptime monitor (every minute) and the
 * post-deploy check in deploy-backend.yml poll. 503 unless the app can sign
 * logins, reach the database, and write to storage (a full disk or inode
 * quota on the shared host breaks uploads, sessions and backups long before
 * PHP dies). Which check failed is logged, never returned.
 *
 * Nothing here may throw: a broken disk or database must come back as a 503,
 * not as a 500 from the code that was meant to report it.
 */
class HealthController extends Controller
{
    /** Probe files are created (and removed) in here, under storage/. */
    public const PROBE_DIR = 'framework/health';

    /** Requests per minute per IP. Sentry checks once a minute per region. */
    public const PER_MINUTE = 10;

    private const VERSION = '1.0.0';

    private const PROBE_BYTES = 4096;

    /** Seconds before an unresponsive MySQL counts as down. */
    private const DB_TIMEOUT = 3;

    private const DB_PROBE = 'health_probe';

    private const REPORT_EVERY = 600;

    public function __invoke(Request $request): JsonResponse
    {
        if ($this->throttled($request)) {
            return response()->json(['detail' => __('Too many requests.')], 429);
        }

        $failed = array_keys(array_filter([
            'jwt_secret' => ! JwtSecretGuard::isConfigured(),
            'database' => ! $this->databaseReachable(),
            'storage' => ! $this->storageWritable(),
        ]));

        // The status body below is for monitors (the deploy check, Sentry
        // uptime) matching on fixed values, so it's never translated.
        if ($failed === []) {
            return response()->json(['status' => 'ok', 'version' => self::VERSION]);
        }

        $this->report($failed);

        return response()->json(['status' => 'degraded', 'version' => self::VERSION], 503);
    }

    /**
     * Done here rather than with the throttle middleware: the limiter lives in
     * the cache, which is on the same disk (or in the database), and the
     * middleware would turn exactly the failures this endpoint reports into a
     * 500. If the limiter can't run, the request goes through.
     */
    private function throttled(Request $request): bool
    {
        // One bucket per IPv6 /64: a single host usually holds the whole block.
        $ip = (string) $request->ip();
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $ip = substr(bin2hex(inet_pton($ip)), 0, 16).'::/64';
        }
        $key = 'health:'.$ip;

        try {
            if (RateLimiter::tooManyAttempts($key, self::PER_MINUTE)) {
                return true;
            }
            RateLimiter::hit($key, 60);
        } catch (\Throwable) {
            // The cache is broken; the checks below will say so.
        }

        return false;
    }

    /**
     * On its own connection, so a MySQL that won't accept connections fails in
     * seconds instead of PDO's default ~60. (The timeout covers connecting only;
     * a server that accepts and then hangs still holds the request.)
     */
    private function databaseReachable(): bool
    {
        try {
            $config = config('database.connections.'.config('database.default'));
            $config['options'] = array_replace($config['options'] ?? [], [PDO::ATTR_TIMEOUT => self::DB_TIMEOUT]);
            config(['database.connections.'.self::DB_PROBE => $config]);

            DB::connection(self::DB_PROBE)->select('select 1');

            return true;
        } catch (\Throwable) {
            return false;
        } finally {
            DB::purge(self::DB_PROBE);
        }
    }

    /**
     * A new file each time: overwriting one fixed file reuses its block and
     * inode, so it keeps passing on a full quota. This needs fresh ones.
     */
    private function storageWritable(): bool
    {
        $dir = storage_path(self::PROBE_DIR);
        $file = $dir.DIRECTORY_SEPARATOR.'probe-'.bin2hex(random_bytes(8));

        try {
            if (! is_dir($dir) && ! @mkdir($dir, 0700, true) && ! is_dir($dir)) {
                return false;
            }

            return @file_put_contents($file, str_repeat('.', self::PROBE_BYTES)) === self::PROBE_BYTES;
        } catch (\Throwable) {
            return false;
        } finally {
            @unlink($file);
        }
    }

    /**
     * Once per 10 minutes per set of failures. With storage down, skip the
     * `single` file log (same disk) and go straight to Sentry.
     */
    private function report(array $failed): void
    {
        $message = 'Health check degraded: '.implode(', ', $failed);

        try {
            if (! $this->firstReportInWindow('report-once:health:'.implode(',', $failed), $failed)) {
                return;
            }
            in_array('storage', $failed, true) ? Log::channel('sentry')->error($message) : Log::error($message);
        } catch (\Throwable) {
            // Logging is on the broken disk too; the 503 still goes out.
        }
    }

    /**
     * The "already reported" marker has to live somewhere that survives what
     * failed, or every request during the outage would log (and anyone could
     * flood Sentry): the default cache, else the database cache when only the
     * disk is gone, else APCu. With nowhere left, log only in the first minute
     * of each 10-minute block.
     */
    private function firstReportInWindow(string $key, array $failed): bool
    {
        foreach (array_unique([config('cache.default'), 'database']) as $store) {
            if (! $this->storeSurvives((string) $store, $failed)) {
                continue;
            }
            try {
                return Cache::store($store)->add($key, true, self::REPORT_EVERY);
            } catch (\Throwable) {
                // e.g. no cache table; try the next one.
            }
        }

        if (function_exists('apcu_enabled') && apcu_enabled()) {
            return apcu_add($key, true, self::REPORT_EVERY);
        }

        return now()->getTimestamp() % self::REPORT_EVERY < 60;
    }

    private function storeSurvives(string $store, array $failed): bool
    {
        $dependsOn = match (config("cache.stores.{$store}.driver")) {
            null => 'unconfigured',
            'file' => 'storage',
            'database' => 'database',
            default => null,
        };

        return $dependsOn === null || ! in_array($dependsOn, [...$failed, 'unconfigured'], true);
    }
}
