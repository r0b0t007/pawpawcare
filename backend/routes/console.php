<?php

use App\Support\Backups;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
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

// RevenueCat: retry webhook events that failed, and sync from RevenueCat's API
// what webhooks can't settle alone (transfers, plan changes). The daily sweep
// re-checks users near expiry / with billing issues and prunes the ledger.
Schedule::command('subscriptions:reconcile')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('subscriptions:reconcile --sweep')->dailyAt('04:40')->withoutOverlapping();

// Nightly encrypted backup of the database + uploads to Cloudflare R2
// (config/backup.php, docs/backups.md). Clean first so a full bucket can't
// block tonight's run; monitor later so a missed night alerts the same day.
// Never silently off: until it's configured, an error is logged every night.
// Cleanup needs only the destination, so retention keeps being enforced even
// if the archive password goes missing.
Schedule::command('backup:clean')->dailyAt('03:00')->withoutOverlapping()
    ->when(fn () => Backups::destinationReady());
Schedule::command('backup:run')->dailyAt('03:15')->withoutOverlapping()
    ->when(fn () => Backups::ready())
    ->sentryMonitor(checkInMargin: 30, maxRuntime: 60, failureIssueThreshold: 1, recoveryThreshold: 1);
Schedule::command('backup:monitor')->dailyAt('09:00')
    ->when(fn () => Backups::ready());
Schedule::call(fn () => Log::error('Backups are not configured', ['missing' => Backups::missing()]))
    ->name('backup:not-configured')->dailyAt('03:15')
    ->skip(fn () => Backups::ready());
