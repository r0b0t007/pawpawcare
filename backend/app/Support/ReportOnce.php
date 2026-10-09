<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Log a message at most once per window (per key). For conditions that can
 * repeat on every request — a misconfigured secret, a flood of rejected
 * webhooks — where one log line (and one Sentry issue) per window is enough.
 */
final class ReportOnce
{
    public static function log(string $key, string $level, string $message, int $everySeconds = 600): void
    {
        try {
            if (! Cache::add('report-once:'.$key, true, $everySeconds)) {
                return;
            }
        } catch (\Throwable) {
            // Cache unavailable: still log rather than stay silent.
        }
        Log::log($level, $message);
    }
}
