<?php

namespace Tests\Feature;

use App\Support\Backups;
use Illuminate\Console\Scheduling\Event as ScheduledEvent;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Spatie\Backup\Events\BackupHasFailed;
use Spatie\Backup\Events\UnhealthyBackupWasFound;
use Spatie\Backup\Notifications\Notifications\BackupHasFailedNotification;
use Tests\TestCase;
use ZipArchive;

class BackupsTest extends TestCase
{
    private const PASSWORD = 'correct-horse-battery-staple-42';

    private string $tmp;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'pawpaw-backup-test-'.uniqid();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->tmp);
        parent::tearDown();
    }

    private function configure(): void
    {
        config([
            'backup.backup.password' => self::PASSWORD,
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

    /** A files-only backup of a temp folder to a temp `backups-local` disk; returns the archives written. */
    private function runFilesBackup(?string $password): array
    {
        File::ensureDirectoryExists("{$this->tmp}/src/vault");
        File::put("{$this->tmp}/src/vault/record.txt", 'rabies vaccine 2026-10-10');

        config([
            'backup.backup.password' => $password,
            'backup.backup.destination.disks' => ['backups-local'],
            'backup.backup.source.files.include' => ["{$this->tmp}/src"],
            'backup.backup.source.files.relative_path' => "{$this->tmp}/src",
            'backup.backup.temporary_directory' => "{$this->tmp}/work",
            'backup.backup.tries' => 1,
            'filesystems.disks.backups-local.root' => "{$this->tmp}/dest",
        ]);

        $this->artisan('backup:run', ['--only-files' => true, '--disable-notifications' => true]);

        return File::isDirectory("{$this->tmp}/dest") ? File::allFiles("{$this->tmp}/dest") : [];
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

    public function test_never_ready_with_a_blank_or_short_archive_password(): void
    {
        $this->configure();

        config(['backup.backup.password' => '  ']);
        $this->assertSame(['BACKUP_ARCHIVE_PASSWORD'], Backups::missing());

        config(['backup.backup.password' => 'hunter2']);
        $this->assertSame(['BACKUP_ARCHIVE_PASSWORD'], Backups::missing());

        // The destination alone is still fine, so retention cleanup keeps running.
        $this->assertTrue(Backups::destinationReady());
    }

    public function test_only_the_r2_bucket_or_the_private_local_disk_are_allowed(): void
    {
        config(['backup.backup.password' => self::PASSWORD]);

        config(['backup.backup.destination.disks' => ['backups-local']]);
        $this->assertTrue(Backups::ready());

        // `public` is web-served and `local` is itself a backup source.
        foreach (['public', 'local', 's3', 'nope'] as $disk) {
            config(['backup.backup.destination.disks' => [$disk]]);
            $this->assertSame(['BACKUP_DISK'], Backups::missing(), $disk);
        }

        $root = config('filesystems.disks.backups-local.root');
        foreach (config('backup.backup.source.files.include') as $source) {
            $this->assertStringStartsNotWith($source, $root);
        }
        $this->assertArrayNotHasKey('serve', config('filesystems.disks.backups-local'));
    }

    public function test_a_manual_run_without_a_usable_password_writes_nothing(): void
    {
        $this->assertSame([], $this->runFilesBackup(null));
        $this->assertSame([], $this->runFilesBackup('too-short'));
    }

    public function test_a_real_run_writes_an_aes_256_archive(): void
    {
        $archives = $this->runFilesBackup(self::PASSWORD);
        $this->assertCount(1, $archives);

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($archives[0]->getPathname()));
        $record = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (! str_ends_with($stat['name'], '/')) {
                $this->assertSame(ZipArchive::EM_AES_256, $stat['encryption_method'], $stat['name']);
            }
            if (str_ends_with($stat['name'], 'record.txt')) {
                $record = $stat['name'];
            }
        }
        $this->assertNotNull($record);

        $this->assertFalse($zip->getFromName($record), 'readable without the password');
        $zip->setPassword(self::PASSWORD);
        $this->assertSame('rabies vaccine 2026-10-10', $zip->getFromName($record));
        $zip->close();
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

    public function test_cleanup_keeps_running_when_only_the_password_is_missing(): void
    {
        $this->configure();
        config(['backup.backup.password' => null]);

        $this->assertFalse($this->scheduled('backup:run')->filtersPass($this->app));
        $this->assertTrue($this->scheduled('backup:clean')->filtersPass($this->app));
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

    public function test_archives_hold_only_uploads_and_expire_within_90_days(): void
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
