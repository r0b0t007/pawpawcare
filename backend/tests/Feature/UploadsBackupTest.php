<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use App\Support\Backups;
use App\Support\UploadsBackup;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\DirectoryListing;
use League\Flysystem\FileAttributes;
use League\Flysystem\UnableToReadFile;
use Mockery;
use Spatie\Backup\Config\Config as BackupConfig;
use Tests\TestCase;
use ZipArchive;

/** The R2 upload buckets inside the nightly backup, the temp sweep, and uploads:restore. */
class UploadsBackupTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery-staple-42';

    private const PHOTO = 'uploads/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd.jpg';

    private const DOC = 'documents/ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210ZyXw.pdf';

    private const DELETED_PHOTO = 'uploads/DeLeTeDdElEtEdDeLeTeDdElEtEdDeLeTeDdElEt.png';

    private string $tmp;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'pawpaw-uploads-backup-'.uniqid();
        foreach (['public', 'local', 'r2-media', 'r2-documents'] as $disk) {
            Storage::fake($disk);
        }
        config(['backup.backup.temporary_directory' => "{$this->tmp}/work"]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->tmp);
        parent::tearDown();
    }

    /** @return \Closure(): list<MessageLogged> the app log records written so far (spatie needs a real logger, so no Log::spy) */
    private function captureLogs(): \Closure
    {
        $records = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$records) {
            $records[] = $e;
        });

        return function () use (&$records) {
            return $records;
        };
    }

    /** @return list<MessageLogged> */
    private static function only(array $records, string $message): array
    {
        return array_values(array_filter($records, fn (MessageLogged $r) => $r->message === $message));
    }

    private function onR2(): void
    {
        config([
            'filesystems.uploads.public_disk' => 'r2-media',
            'filesystems.uploads.private_disk' => 'r2-documents',
            'filesystems.disks.r2-media.url' => 'https://media.pawpawcare.app',
        ]);
    }

    /** @return array<string, string> archive entry name => decrypted contents */
    private function runBackup(): array
    {
        File::ensureDirectoryExists("{$this->tmp}/src");
        File::put("{$this->tmp}/src/marker.txt", 'local source');
        config([
            'backup.backup.password' => self::PASSWORD,
            'backup.backup.destination.disks' => ['backups-local'],
            'backup.backup.source.files.include' => ["{$this->tmp}/src"],
            'backup.backup.source.files.relative_path' => "{$this->tmp}/src",
            'backup.backup.tries' => 1,
            'filesystems.disks.backups-local.root' => "{$this->tmp}/dest",
        ]);
        // RefreshDatabase already booted Artisan, whose backup:run captured
        // spatie's Config before these overrides: rebuild both.
        $this->app->forgetInstance(BackupConfig::class);
        $this->app->make(ConsoleKernel::class)->setArtisan(null);

        $this->artisan('backup:run', ['--only-files' => true, '--disable-notifications' => true]);

        $archives = File::allFiles("{$this->tmp}/dest");
        $this->assertCount(1, $archives);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($archives[0]->getPathname()));
        $zip->setPassword(self::PASSWORD);
        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (str_ends_with($stat['name'], '/')) {
                continue;
            }
            $this->assertSame(ZipArchive::EM_AES_256, $stat['encryption_method'], $stat['name']);
            $entries[str_replace('\\', '/', $stat['name'])] = $zip->getFromIndex($i);
        }
        $zip->close();

        return $entries;
    }

    public function test_r2_objects_go_into_the_encrypted_archive(): void
    {
        $this->onR2();
        Storage::disk('r2-media')->put(self::PHOTO, 'photo bytes');
        Storage::disk('r2-documents')->put(self::DOC, 'lab result');

        $entries = $this->runBackup();

        $this->assertSame('photo bytes', $entries['r2-media/'.self::PHOTO]);
        $this->assertSame('lab result', $entries['r2-documents/'.self::DOC]);
        $this->assertSame('local source', $entries['marker.txt']);
        // The plaintext copies lived in the backup's temp folder, which spatie deletes.
        $this->assertDirectoryDoesNotExist(UploadsBackup::stagingRoot());
    }

    public function test_local_disks_add_nothing(): void
    {
        Storage::disk('r2-media')->put(self::PHOTO, 'not in use');

        $this->assertSame(['marker.txt'], array_keys($this->runBackup()));
    }

    public function test_an_unreadable_bucket_is_an_error_but_the_backup_still_runs(): void
    {
        $this->onR2();
        $logs = $this->captureLogs();
        $broken = Mockery::mock(FilesystemAdapter::class);
        $broken->shouldReceive('listContents')->andThrow(new \RuntimeException('R2 said 503'));
        Storage::set('r2-documents', $broken);

        $entries = $this->runBackup();

        $this->assertSame(['marker.txt'], array_keys($entries));
        $errors = self::only($logs(), 'Backup is missing uploads');
        $this->assertCount(1, $errors);
        $this->assertSame('error', $errors[0]->level);
        $this->assertSame('R2 said 503', $errors[0]->context['error']);
    }

    public function test_over_the_limit_documents_still_go_in_before_photos(): void
    {
        $this->onR2();
        config(['backup.uploads.max_megabytes' => 1]);
        $logs = $this->captureLogs();
        Storage::disk('r2-documents')->put(self::DOC, str_repeat('d', 600000));
        Storage::disk('r2-media')->put(self::PHOTO, str_repeat('p', 600000));

        $entries = $this->runBackup();

        $this->assertArrayHasKey('r2-documents/'.self::DOC, $entries);
        $this->assertArrayNotHasKey('r2-media/'.self::PHOTO, $entries);
        $errors = self::only($logs(), 'Backup is missing uploads');
        $this->assertCount(1, $errors);
        $this->assertSame('r2-media', $errors[0]->context['disk']);
        $this->assertStringContainsString('over what is left of BACKUP_UPLOADS_MAX_MB', $errors[0]->context['error']);
    }

    public function test_a_file_deleted_during_the_run_is_skipped_quietly(): void
    {
        $this->onR2();
        $logs = $this->captureLogs();
        $gone = 'uploads/GoNeGoNeGoNeGoNeGoNeGoNeGoNeGoNeGoNeGoNe.jpg';
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('listContents')->andReturn(new DirectoryListing([
            new FileAttributes($gone, 5), new FileAttributes(self::PHOTO, 11),
        ]));
        $disk->shouldReceive('readStream')->with($gone)->andThrow(UnableToReadFile::fromLocation($gone, 'NoSuchKey'));
        $disk->shouldReceive('fileExists')->with($gone)->andReturn(false);
        $kept = fopen('php://memory', 'w+b');
        fwrite($kept, 'photo bytes');
        rewind($kept);
        $disk->shouldReceive('readStream')->with(self::PHOTO)->andReturn($kept);
        Storage::set('r2-media', $disk);

        $entries = $this->runBackup();

        $this->assertSame('photo bytes', $entries['r2-media/'.self::PHOTO]);
        $this->assertArrayNotHasKey("r2-media/{$gone}", $entries);
        $this->assertSame([], self::only($logs(), 'Backup is missing uploads'));
    }

    public function test_a_truncated_download_drops_that_bucket(): void
    {
        $this->onR2();
        $logs = $this->captureLogs();
        Storage::disk('r2-documents')->put(self::DOC, 'lab result');
        $flaky = Mockery::mock(FilesystemAdapter::class);
        $flaky->shouldReceive('listContents')->andReturn(new DirectoryListing([new FileAttributes(self::PHOTO, 100)]));
        $short = fopen('php://memory', 'w+b');
        fwrite($short, 'cut off');
        rewind($short);
        $flaky->shouldReceive('readStream')->andReturn($short);
        Storage::set('r2-media', $flaky);

        $entries = $this->runBackup();

        $this->assertArrayNotHasKey('r2-media/'.self::PHOTO, $entries);
        $this->assertSame('lab result', $entries['r2-documents/'.self::DOC]);
        $errors = self::only($logs(), 'Backup is missing uploads');
        $this->assertCount(1, $errors);
        $this->assertStringContainsString('copied 7 of 100 bytes', $errors[0]->context['error']);
    }

    public function test_only_names_the_app_writes_are_copied(): void
    {
        $this->onR2();
        $logs = $this->captureLogs();
        Storage::disk('r2-media')->put('uploads/evil.html', '<script>');
        Storage::disk('r2-media')->put('uploads/nested/'.basename(self::PHOTO), 'nested');

        $this->assertSame(['marker.txt'], array_keys($this->runBackup()));
        $this->assertCount(2, self::only($logs(), 'Backup skipped an unexpected upload key'));

        foreach (['uploads/../../.env', self::PHOTO."\n", 'uploads/'.str_repeat('a', 40).'.svg', 'documents/'.str_repeat('a', 40).'.pdf'] as $key) {
            $this->assertFalse(UploadsBackup::isSafeKey('r2-media', $key), json_encode($key));
        }
        $this->assertTrue(UploadsBackup::isSafeKey('r2-documents', self::DOC));
    }

    public function test_the_backups_bucket_and_key_must_differ_from_the_uploads(): void
    {
        config([
            'backup.backup.password' => self::PASSWORD,
            'filesystems.disks.backups.bucket' => 'pawpawcare-media',
            'filesystems.disks.backups.endpoint' => 'https://example.r2.cloudflarestorage.com',
            'filesystems.disks.backups.key' => 'uploads-key',
            'filesystems.disks.backups.secret' => 'secret',
            'filesystems.disks.r2-media.bucket' => 'pawpawcare-media',
            'filesystems.disks.r2-media.key' => 'uploads-key',
        ]);

        $this->assertSame([
            'BACKUP_R2_BUCKET (must not be an upload bucket)',
            'BACKUP_R2_ACCESS_KEY_ID (must not be the uploads key)',
        ], Backups::destinationMissing());
    }

    public function test_sweep_deletes_only_an_abandoned_staging_folder(): void
    {
        $root = UploadsBackup::stagingRoot();
        File::ensureDirectoryExists("{$root}/r2-documents/documents");
        File::put("{$root}/r2-documents/".self::DOC, 'lab result');

        $this->artisan('backup:sweep-temp')->expectsOutputToContain('may still be running')->assertSuccessful();
        $this->assertFileExists("{$root}/r2-documents/".self::DOC);

        $old = now()->subHours(7)->getTimestamp();
        touch("{$root}/r2-documents/".self::DOC, $old);
        touch("{$root}/r2-documents/documents", $old);
        touch("{$root}/r2-documents", $old);
        touch($root, $old);

        $this->artisan('backup:sweep-temp')->assertSuccessful();
        $this->assertDirectoryDoesNotExist($root);
    }

    private function extracted(): string
    {
        $dir = "{$this->tmp}/restore";
        File::ensureDirectoryExists("{$dir}/r2-media/uploads");
        File::ensureDirectoryExists("{$dir}/r2-documents/documents");
        File::put("{$dir}/r2-media/".self::PHOTO, 'backup photo');
        File::put("{$dir}/r2-media/".self::DELETED_PHOTO, 'a photo its owner deleted');
        File::put("{$dir}/r2-documents/".self::DOC, 'backup lab result');
        File::put("{$dir}/r2-media/uploads/page.html", '<script>');

        return $dir;
    }

    /** Records pointing at PHOTO and DOC, as in a database restored from the same backup. */
    private function records(): void
    {
        $owner = User::create([
            'name' => 'U', 'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'), 'timezone' => 'UTC',
        ]);
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        $pet->forceFill(['avatar_url' => 'https://media.pawpawcare.app/'.self::PHOTO])->saveQuietly();
        Document::create(['pet_id' => $pet->id, 'title' => 'Lab', 'file_path' => self::DOC, 'mime' => 'application/pdf', 'size_bytes' => 17]);
    }

    public function test_restore_puts_back_referenced_files_only_and_never_overwrites(): void
    {
        $this->onR2();
        $this->records();
        Storage::disk('r2-documents')->put(self::DOC, 'newer lab result');

        $this->artisan('uploads:restore', ['path' => $this->extracted()])
            ->expectsOutputToContain('Restored 1 file(s); 1 already on R2 and left alone; 1 no record points at (left out); 1 skipped.')
            ->assertSuccessful();

        $this->assertSame('backup photo', Storage::disk('r2-media')->get(self::PHOTO));
        $this->assertSame('newer lab result', Storage::disk('r2-documents')->get(self::DOC));
        $this->assertFalse(Storage::disk('r2-media')->exists(self::DELETED_PHOTO), 'a deleted photo was made public again');
        $this->assertFalse(Storage::disk('r2-media')->exists('uploads/page.html'));
    }

    public function test_restore_can_include_unreferenced_files_on_request(): void
    {
        $this->onR2();

        $this->artisan('uploads:restore', ['path' => $this->extracted(), '--include-unreferenced' => true])
            ->expectsOutputToContain('Restored 3 file(s)')
            ->assertSuccessful();

        $this->assertTrue(Storage::disk('r2-media')->exists(self::DELETED_PHOTO));
    }

    public function test_restore_dry_run_writes_nothing(): void
    {
        $this->onR2();
        $this->records();

        $this->artisan('uploads:restore', ['path' => $this->extracted(), '--dry-run' => true])
            ->expectsOutputToContain('Would restore 2 file(s)')
            ->assertSuccessful();

        $this->assertSame([], Storage::disk('r2-media')->allFiles());
        $this->assertSame([], Storage::disk('r2-documents')->allFiles());
    }

    public function test_restore_refuses_when_uploads_are_not_on_r2(): void
    {
        $this->artisan('uploads:restore', ['path' => $this->extracted()])
            ->expectsOutputToContain("uploads don't use r2-media")
            ->assertFailed();

        $this->artisan('uploads:restore', ['path' => "{$this->tmp}/missing"])->assertFailed();
    }
}
