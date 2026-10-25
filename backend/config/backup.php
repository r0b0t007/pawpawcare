<?php

use Spatie\Backup\Notifications\Notifiable;
use Spatie\Backup\Notifications\Notifications\BackupHasFailedNotification;
use Spatie\Backup\Notifications\Notifications\BackupWasSuccessfulNotification;
use Spatie\Backup\Notifications\Notifications\CleanupHasFailedNotification;
use Spatie\Backup\Notifications\Notifications\CleanupWasSuccessfulNotification;
use Spatie\Backup\Notifications\Notifications\HealthyBackupWasFoundNotification;
use Spatie\Backup\Notifications\Notifications\UnhealthyBackupWasFoundNotification;
use Spatie\Backup\Tasks\Cleanup\Strategies\DefaultStrategy;
use Spatie\Backup\Tasks\Monitor\HealthChecks\MaximumAgeInDays;
use Spatie\Backup\Tasks\Monitor\HealthChecks\MaximumStorageInMegabytes;

/*
 * Nightly encrypted backups of the database and user uploads to Cloudflare R2
 * (spatie/laravel-backup). Runbook, restore steps and the monthly restore
 * drill: docs/backups.md. Scheduling lives in routes/console.php and only runs
 * once App\Support\Backups::ready() — otherwise it logs an error daily.
 */
return [

    'backup' => [
        // Folder name inside the bucket; also what backup:monitor looks for.
        'name' => 'pawpawcare',

        'source' => [
            'files' => [
                // Only user uploads — the code is in git, and leaving out the
                // app root keeps .env (every secret) out of the archive.
                'include' => [
                    storage_path('app/private'),
                    storage_path('app/public'),
                ],
                'exclude' => [],
                'follow_links' => false,
                'ignore_unreadable_directories' => false,
                'relative_path' => storage_path('app'),
            ],

            // Dump options (single transaction, no tablespaces, skipped cache
            // tables) are on the connection in config/database.php.
            'databases' => [
                env('DB_CONNECTION', 'mysql'),
            ],
        ],

        'database_dump_compressor' => null,
        'database_dump_file_timestamp_format' => null,
        'database_dump_filename_base' => 'database',
        'database_dump_file_extension' => '',

        'destination' => [
            'compression_method' => ZipArchive::CM_DEFAULT,
            'compression_level' => 6,
            'filename_prefix' => '',
            // Only `backups` (R2) or `backups-local` — Backups::DISKS.
            'disks' => [
                env('BACKUP_DISK', 'backups'),
            ],
            'continue_on_failure' => false,
        ],

        'temporary_directory' => storage_path('app/backup-temp'),

        // Archives hold pets' medical records: always AES-256. Backups::
        // assertEncryptable() aborts every run (manual ones too) unless the
        // password is set and ext-zip really supports AES.
        'password' => env('BACKUP_ARCHIVE_PASSWORD'),
        'encryption' => 'aes256',

        'verify_backup' => true,
        'tries' => 2,
        'retry_delay' => 60,
    ],

    /*
     * The R2 upload buckets, copied into every archive (App\Support\
     * UploadsBackup; spatie ignores this key). About 38 archives fit under
     * the 8 GB caps below, so past ~200 MB of uploads each copy would push
     * old backups out early. Above the limit, or without twice that much free
     * disk, only the files that fit go in (documents first, a fair share per
     * account), the rest is logged as an error, and the database is still
     * backed up. Raise it together with the caps below.
     */
    'uploads' => [
        'max_megabytes' => (int) env('BACKUP_UPLOADS_MAX_MB', 200),
    ],

    /*
     * No mail: failures surface through the listeners in AppServiceProvider
     * (Log::error → Sentry) and the backup:run Sentry cron monitor.
     */
    'notifications' => [
        'notifications' => [
            BackupHasFailedNotification::class => [],
            UnhealthyBackupWasFoundNotification::class => [],
            CleanupHasFailedNotification::class => [],
            BackupWasSuccessfulNotification::class => [],
            HealthyBackupWasFoundNotification::class => [],
            CleanupWasSuccessfulNotification::class => [],
        ],
        'notifiable' => Notifiable::class,
        'mail' => [
            'to' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
            'from' => [
                'address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
                'name' => env('MAIL_FROM_NAME', 'PawPawCare'),
            ],
        ],
        'slack' => ['webhook_url' => '', 'channel' => null, 'username' => null, 'icon' => null],
        'discord' => ['webhook_url' => '', 'username' => '', 'avatar_url' => ''],
        'webhook' => ['url' => ''],
    ],

    // Spatie's own step-by-step log (with stack traces) stays in a file on the
    // host; the listeners in AppServiceProvider are the Sentry signal.
    'log_channel' => env('BACKUP_LOG_CHANNEL', 'single'),

    'monitor_backups' => [
        [
            'name' => 'pawpawcare',
            'disks' => [env('BACKUP_DISK', 'backups')],
            'health_checks' => [
                MaximumAgeInDays::class => 1,
                MaximumStorageInMegabytes::class => 8000,
            ],
        ],
    ],

    /*
     * Retention: every backup for 7 days, one a day to day 30, one a week to
     * ~day 86, nothing older. The privacy policy promises deleted accounts are
     * gone from backups within 90 days — keep these numbers inside that.
     */
    'cleanup' => [
        'strategy' => DefaultStrategy::class,
        'default_strategy' => [
            'keep_all_backups_for_days' => 7,
            'keep_daily_backups_for_days' => 23,
            'keep_weekly_backups_for_weeks' => 8,
            'keep_monthly_backups_for_months' => 0,
            'keep_yearly_backups_for_years' => 0,
            // R2's free tier is 10 GB.
            'delete_oldest_backups_when_using_more_megabytes_than' => 8000,
        ],
        'tries' => 1,
        'retry_delay' => 0,
    ],

];
