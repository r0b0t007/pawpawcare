<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Scan for due reminders every minute. Requires a cron entry running
// `php artisan schedule:run` in production (or `php artisan schedule:work` in dev).
// Sentry Crons check-in: the only alarm if the cPanel cron stops running
// (reminders are the core feature). Inert without SENTRY_LARAVEL_DSN.
Schedule::command('reminders:send')->everyMinute()->withoutOverlapping()
    ->sentryMonitor(checkInMargin: 5, maxRuntime: 10, failureIssueThreshold: 3, recoveryThreshold: 1);

// Keep the refresh_tokens table from growing without bound.
Schedule::command('auth:prune-tokens')->daily();

// Sweep uploaded images that are no longer referenced (e.g. abandoned picks).
Schedule::command('uploads:prune')->daily();

// Permanently purge accounts whose 30-day deletion grace period has passed.
Schedule::command('accounts:purge-deleted')->daily();

// Recompute per-pet weekly care streaks and award new milestones.
Schedule::command('gamification:nightly')->daily()->withoutOverlapping();

// Birthday / gotcha-day / weekly-recap pushes at each user's LOCAL hour —
// hourly so every timezone gets its morning; the engagement_pushes unique
// ledger makes reruns no-ops.
Schedule::command('engagement:send')->hourly()->withoutOverlapping(55);
