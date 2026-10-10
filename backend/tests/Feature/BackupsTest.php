<?php

namespace Tests\Feature;

use App\Support\Backups;
use Illuminate\Console\Scheduling\Event as ScheduledEvent;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Spatie\Backup\Events\BackupHasFailed;
use Spatie\Backup\Events\UnhealthyBackupWasFound;
use Spatie\Backup\Notifications\Notifications\BackupHasFailedNotification;
use Tests\TestCase;

class BackupsTest extends TestCase
{
    private function configure(): void
    {
        config([
            'backup.backup.password' => 'correct horse battery staple',
            'filesystems.disks.backups.bucket' => 'pawpawcare-backups',
            'filesystems.disks.backups.endpoint' => 'https://example.r2.cloudflarestorage.com',
            'filesystems.disks.backups.key' => 'key-id',
            'filesystems.disks.backups.secret' => 'secret',
        ]);
    }

    private function scheduled(string $name): ScheduledEvent
    {
        $event = collect($this->app->make(Schedule::class)->events())
            ->first(fn (ScheduledEvent $e) => str_contains((string) ($e->command ?? $e->description), $name));
        $this->assertNotNull($event, "{$name} is not scheduled");

        return $event;
    }

    public function test_not_ready_lists_every_missing_key(): void
    {
        $this->assertFalse(Backups::ready());
        $this->assertSame([
            'BACKUP_ARCHIVE_PASSWORD',
            'BACKUP_R2_BUCKET',
            'BACKUP_R2_ENDPOINT',
            'BACKUP_R2_ACCESS_KEY_ID',
            'BACKUP_R2_SECRET_ACCESS_KEY',
        ], Backups::missing());

        $this->configure();
        $this->assertTrue(Backups::ready());
    }

    public function test_never_ready_without_an_archive_password(): void
    {
        $this->configure();
        config(['backup.backup.password' => '  ']);

        $this->assertSame(['BACKUP_ARCHIVE_PASSWORD'], Backups::missing());
    }

    public function test_a_local_disk_needs_no_r2_keys_but_an_unknown_disk_is_flagged(): void
    {
        config(['backup.backup.password' => 'pw', 'backup.backup.destination.disks' => ['local']]);
        $this->assertTrue(Backups::ready());

        config(['backup.backup.destination.disks' => ['nope']]);
        $this->assertSame(['BACKUP_DISK'], Backups::missing());
    }

    public function test_unconfigured_backups_log_an_error_instead_of_running(): void
    {
        $this->assertFalse($this->scheduled('backup:run')->filtersPass($this->app));
        $this->assertFalse($this->scheduled('backup:clean')->filtersPass($this->app));
        $this->assertTrue($this->scheduled('backup:not-configured')->filtersPass($this->app));

        $this->configure();
        $this->assertTrue($this->scheduled('backup:run')->filtersPass($this->app));
        $this->assertTrue($this->scheduled('backup:monitor')->filtersPass($this->app));
        $this->assertFalse($this->scheduled('backup:not-configured')->filtersPass($this->app));
    }

    public function test_failures_become_error_logs(): void
    {
        Log::spy();

        event(new BackupHasFailed(new RuntimeException('mysqldump: access denied'), 'backups', 'pawpawcare'));
        event(new UnhealthyBackupWasFound('backups', 'pawpawcare', new Collection([
            ['check' => 'MaximumAgeInDays', 'message' => 'The latest backup is too old'],
        ])));

        Log::shouldHaveReceived('error')->with('Backup failed', ['disk' => 'backups', 'error' => 'mysqldump: access denied'])->once();
        Log::shouldHaveReceived('error')->with('Backups are unhealthy', ['disk' => 'backups', 'problems' => ['The latest backup is too old']])->once();
    }

    public function test_archives_are_encrypted_hold_only_uploads_and_expire_within_90_days(): void
    {
        $this->assertSame('aes256', config('backup.backup.encryption'));
        $this->assertSame([], config('backup.notifications.notifications.'.BackupHasFailedNotification::class));

        // Uploads only: the app root (and its .env of secrets) never goes in.
        foreach (config('backup.backup.source.files.include') as $path) {
            $this->assertStringStartsWith(storage_path('app'), $path);
        }

        // The privacy policy promises deleted accounts leave backups within 90 days.
        $keep = config('backup.cleanup.default_strategy');
        $days = $keep['keep_all_backups_for_days'] + $keep['keep_daily_backups_for_days']
            + 7 * $keep['keep_weekly_backups_for_weeks'] + 31 * $keep['keep_monthly_backups_for_months']
            + 366 * $keep['keep_yearly_backups_for_years'];
        $this->assertLessThanOrEqual(90, $days);

        $disk = config('filesystems.disks.backups');
        $this->assertSame('private', $disk['visibility']);
        $this->assertTrue($disk['throw']);
    }
}
