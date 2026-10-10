<?php

namespace App\Http\Controllers;

use App\Support\JwtSecretGuard;
use App\Support\ReportOnce;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * GET /health — what the Sentry uptime monitor (every minute) and the
 * post-deploy check in deploy-backend.yml poll. 503 unless the app can sign
 * logins, reach the database, and write to storage (a full disk or inode
 * quota on the shared host breaks uploads, sessions and backups long before
 * PHP dies). Which check failed is logged, never returned.
 */
class HealthController extends Controller
{
    /** Probe files are created (and removed) in here, under storage/. */
    public const PROBE_DIR = 'framework/health';

    private const PROBE_BYTES = 4096;

    public function __invoke(): JsonResponse
    {
        $failed = array_keys(array_filter([
            'jwt_secret' => ! JwtSecretGuard::isConfigured(),
            'database' => ! $this->databaseReachable(),
            'storage' => ! $this->storageWritable(),
        ]));

        if ($failed === []) {
            return response()->json(['status' => 'ok', 'version' => '1.0.0']);
        }

        $this->report($failed);

        return response()->json(['status' => 'degraded', 'version' => '1.0.0'], 503);
    }

    private function databaseReachable(): bool
    {
        try {
            DB::select('select 1');

            return true;
        } catch (\Throwable) {
            return false;
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
     * Once per 10 minutes. ReportOnce keeps that window in the cache, which
     * lives on the same disk (or in the database), so it can't be trusted when
     * those are what failed: fall back to logging only in the first minute of
     * each 10-minute block, which still bounds Sentry events during an outage.
     */
    private function report(array $failed): void
    {
        $message = 'Health check degraded: '.implode(', ', $failed);

        if (array_intersect($failed, ['storage', 'database']) === []) {
            ReportOnce::log('health:'.implode(',', $failed), 'error', $message);
        } elseif (time() % 600 < 60) {
            Log::error($message);
        }
    }
}
