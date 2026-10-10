<?php

namespace App\Http\Controllers;

use App\Support\JwtSecretGuard;
use App\Support\ReportOnce;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * GET /health — what the Sentry uptime monitor (every minute) and the
 * post-deploy check in deploy-backend.yml poll. 503 unless the app can sign
 * logins, reach the database, and write to storage (a full disk quota on the
 * shared host breaks uploads, sessions and backups long before PHP dies).
 * Which check failed is logged (once per 10 minutes), never returned.
 */
class HealthController extends Controller
{
    public const PROBE_FILE = 'framework/health-probe';

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

        ReportOnce::log('health:'.implode(',', $failed), 'error', 'Health check degraded: '.implode(', ', $failed));

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

    private function storageWritable(): bool
    {
        try {
            return @file_put_contents(storage_path(self::PROBE_FILE), (string) time(), LOCK_EX) !== false;
        } catch (\Throwable) {
            return false;
        }
    }
}
