<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Scan for due reminders every minute. Requires a cron entry running
// `php artisan schedule:run` in production (or `php artisan schedule:work` in dev).
Schedule::command('reminders:send')->everyMinute()->withoutOverlapping();

// Keep the refresh_tokens table from growing without bound.
Schedule::command('auth:prune-tokens')->daily();

// Sweep uploaded images that are no longer referenced (e.g. abandoned picks).
Schedule::command('uploads:prune')->daily();

// Permanently purge accounts whose 30-day deletion grace period has passed.
Schedule::command('accounts:purge-deleted')->daily();
