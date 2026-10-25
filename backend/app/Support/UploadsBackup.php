<?php

namespace App\Support;

use App\Models\Document;
use App\Models\Upload;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Filesystem\FilesystemAdapter as Filesystem;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\StorageAttributes;
use League\Flysystem\UnableToReadFile;
use Spatie\Backup\Tasks\Backup\Manifest;
use Throwable;

/**
 * Puts the R2 upload buckets into the nightly backup (docs/backups.md). The
 * local upload folders are backup sources already; once uploads live on R2
 * (docs/uploads-r2.md) every object is copied into the backup's temporary
 * folder and zipped with the database, so the R2 files get the same AES-256
 * archive, retention and restore path. Read with the uploads key, uploaded
 * with the backups key: neither key gains access to the other's bucket.
 *
 * The staged copies are plaintext medical records on a shared host, so they
 * are private to the account (0700/0600), removed if the process dies with a
 * fatal error, and swept by `backup:sweep-temp` if it was killed outright.
 */
class UploadsBackup
{
    /** Remote upload disk => the folder its objects live under (Uploads::randomPath). */
    public const DIRS = ['r2-media' => 'uploads', 'r2-documents' => 'documents'];

    /**
     * What the app writes there: 40 random characters and a short extension
     * (Uploads::MANAGED_PATH; older uploads kept their original one, e.g.
     * .bmp). Nothing can climb out of the temp or restore folder.
     */
    private const KEY_PATTERNS = [
        'r2-media' => '#^uploads/[A-Za-z0-9]{40}\.[A-Za-z0-9]{2,5}$#D',
        'r2-documents' => '#^documents/[A-Za-z0-9]{40}\.[A-Za-z0-9]{2,5}$#D',
    ];

    /** Medical records first: when not everything fits, they matter most. */
    private const PRIORITY = ['r2-documents', 'r2-media'];

    /** Free space kept beyond the staged copies and the zip. */
    private const DISK_MARGIN_BYTES = 100 * 1048576;

    /** Set from the command line: `backup:run --only-db` wants no files at all. */
    private static bool $databaseOnly = false;

    private static bool $cleanupRegistered = false;

    /** CommandStarting listener (AppServiceProvider). */
    public static function noteCommand(CommandStarting $event): void
    {
        if ($event->command === 'backup:run') {
            self::$databaseOnly = $event->input->hasParameterOption('--only-db');
        }
    }

    /**
     * Copy every object on the remote upload disks next to the manifest and
     * add them to it; in the archive they sit under `<disk>/<key>`. Documents
     * go first. When a bucket doesn't fit under the size limit or on disk,
     * the files that fit go in, shared fairly between accounts (pick()), and
     * the rest is logged (Sentry). A bucket that can't be listed or read in
     * full is logged and left out: an R2 outage, or one user's flood of
     * uploads, must not also cost the night's database backup.
     */
    public static function addToManifest(Manifest $manifest): void
    {
        if (self::$databaseOnly) {
            return;
        }
        $root = dirname($manifest->path());
        try {
            $disks = self::remoteDisks();
        } catch (Throwable $e) {
            Log::error('Backup is missing uploads', ['error' => $e->getMessage()]);

            return;
        }
        usort($disks, fn ($a, $b) => array_search($a, self::PRIORITY, true) <=> array_search($b, self::PRIORITY, true));

        self::cleanUpOnFatalError($root);
        $budget = (int) config('backup.uploads.max_megabytes') * 1048576;
        $stagedBytes = 0;
        foreach ($disks as $name) {
            try {
                $disk = Storage::disk($name);
                $objects = self::listObjects($disk, $name);
                $diskRoom = self::diskRoom($stagedBytes, $root);
                $room = min($budget, $diskRoom);
                $picked = array_sum(array_column($objects, 0)) > $room ? self::pick($name, $objects, $room) : $objects;
                $staged = self::stage($disk, $name, $picked, $root);
            } catch (Throwable $e) {
                File::deleteDirectory($root.DIRECTORY_SEPARATOR.$name);
                Log::error('Backup is missing uploads', ['disk' => $name, 'error' => $e->getMessage()]);

                continue;
            }
            if (count($picked) < count($objects)) {
                Log::error('Backup is missing uploads', ['disk' => $name, 'error' => self::leftOutMessage(
                    $objects, $picked, $diskRoom < $budget ? 'the free disk' : sprintf(
                        'what is left of BACKUP_UPLOADS_MAX_MB (%.1f of %d MB)',
                        max(0, $budget) / 1048576, (int) config('backup.uploads.max_megabytes'),
                    ),
                )]);
            }
            $bytes = array_sum(array_column($picked, 0));
            $budget -= $bytes;
            $stagedBytes += $bytes;
            $manifest->addFiles($staged);
            backupLogger()->info('Added '.count($staged).' file(s) ('.round($bytes / 1048576, 1)." MB) from {$name}.");
        }
    }

    /**
     * The files that fit in $room, shared fairly between the accounts that
     * own them: the smallest accounts go in whole, and the largest share
     * what's left equally (each an account's oldest files first). So one
     * account's flood of uploads never pushes everyone else's files out.
     * Files no account owns (left for `uploads:prune`) share as one account.
     *
     * @param  array<string, array{0: int, 1: int}>  $objects  key => [size, last modified]
     * @return array<string, array{0: int, 1: int}>
     */
    private static function pick(string $name, array $objects, int $room): array
    {
        $owners = $name === 'r2-documents'
            ? Document::join('pets', 'pets.id', '=', 'documents.pet_id')->pluck('pets.owner_id', 'documents.file_path')->all()
            : Upload::pluck('user_id', 'path')->all();

        $groups = [];
        foreach ($objects as $key => $object) {
            $groups[$owners[$key] ?? ''][$key] = $object;
        }
        $total = fn (array $files) => array_sum(array_column($files, 0));
        usort($groups, fn ($a, $b) => $total($a) <=> $total($b));

        $picked = [];
        $left = max(0, $room);
        $remaining = count($groups);
        foreach ($groups as $files) {
            uksort($files, fn ($a, $b) => [$files[$a][1], $a] <=> [$files[$b][1], $b]);
            // An equal share of what's left; what a smaller account didn't use passes on.
            $share = intdiv($left, $remaining--);
            $used = 0;
            foreach ($files as $key => [$size]) {
                if ($used + $size <= $share) {
                    $picked[$key] = $files[$key];
                    $used += $size;
                }
            }
            $left -= $used;
        }

        return $picked;
    }

    /**
     * @param  array<string, array{0: int, 1: int}>  $objects
     * @param  array<string, array{0: int, 1: int}>  $picked
     */
    private static function leftOutMessage(array $objects, array $picked, string $limit): string
    {
        $out = array_diff_key($objects, $picked);

        return sprintf(
            '%d of %d file(s) (%.1f of %.1f MB) left out, over %s; raise it with the backup storage caps (docs/backups.md)',
            count($out), count($objects), array_sum(array_column($out, 0)) / 1048576,
            array_sum(array_column($objects, 0)) / 1048576, $limit,
        );
    }

    /** @return list<string> the configured upload disks that live on R2. */
    public static function remoteDisks(): array
    {
        $disks = array_unique([Uploads::publicDiskName(), Uploads::privateDiskName()]);

        return array_values(array_filter($disks, fn (string $name) => isset(self::DIRS[$name])));
    }

    public static function isSafeKey(string $disk, string $key): bool
    {
        return isset(self::KEY_PATTERNS[$disk]) && preg_match(self::KEY_PATTERNS[$disk], $key) === 1;
    }

    /** spatie's working folder (same default as its service provider), where a killed run leaves plaintext. */
    public static function stagingRoot(): string
    {
        $base = trim((string) config('backup.backup.temporary_directory'));

        return rtrim($base !== '' ? $base : storage_path('app/backup-temp'), '/\\').DIRECTORY_SEPARATOR.'temp';
    }

    /** @return array<string, array{0: int, 1: int}> the disk's safe keys => [size, last modified] */
    private static function listObjects(Filesystem $disk, string $name): array
    {
        $objects = [];
        foreach ($disk->listContents(self::DIRS[$name], true) as $item) {
            /** @var StorageAttributes $item */
            if (! $item->isFile()) {
                continue;
            }
            if (! self::isSafeKey($name, $item->path())) {
                Log::warning('Backup skipped an unexpected upload key', ['disk' => $name, 'key' => $item->path()]);

                continue;
            }
            $objects[$item->path()] = [
                $item->fileSize() ?? $disk->size($item->path()),
                (int) $item->lastModified(),
            ];
        }

        return $objects;
    }

    /**
     * How many bytes of this bucket fit on disk. Each byte is written twice:
     * its copy, then its part of a zip of everything (this bucket, the ones
     * staged before it, the SQL dump). Running out of space while zipping
     * would fail the whole run, database included. This sees the filesystem,
     * not a cPanel quota; the size limit bounds that.
     */
    private static function diskRoom(int $stagedBytes, string $root): int
    {
        $free = @disk_free_space($root);
        if ($free === false) {
            return PHP_INT_MAX;
        }
        $dumps = 0;
        foreach (File::glob($root.DIRECTORY_SEPARATOR.'db-dumps'.DIRECTORY_SEPARATOR.'*') as $dump) {
            $dumps += (int) @filesize($dump);
        }

        return max(0, intdiv((int) $free - $stagedBytes - $dumps - self::DISK_MARGIN_BYTES, 2));
    }

    /**
     * @param  array<string, array{0: int, 1: int}>  $objects
     * @return list<string> the staged copies
     */
    private static function stage(Filesystem $disk, string $name, array $objects, string $root): array
    {
        $staged = [];
        foreach ($objects as $key => [$size]) {
            $e = null;
            try {
                $in = $disk->readStream($key);
            } catch (UnableToReadFile $e) {
                $in = null;
            }
            if (! is_resource($in)) {
                // Deleted since the listing (a user removed it mid-run): it
                // doesn't belong in the backup. Anything else is a real failure.
                if (! $disk->fileExists($key)) {
                    continue;
                }
                throw $e ?? new \RuntimeException("couldn't read {$name}:{$key}");
            }
            $target = self::stagedPath($root, $name, $key);
            self::copyToFile($in, $target, $size);
            $staged[] = $target;
        }

        return $staged;
    }

    private static function stagedPath(string $root, string $disk, string $key): string
    {
        $target = $root.DIRECTORY_SEPARATOR.$disk.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $key);
        $dir = dirname($target);
        if (! is_dir($dir)) {
            File::makeDirectory($dir, 0700, true);
            @chmod($root.DIRECTORY_SEPARATOR.$disk, 0700);
        }

        return $target;
    }

    /** @param  resource  $in */
    private static function copyToFile($in, string $target, int $expected): void
    {
        $out = fopen($target, 'xb');
        try {
            if ($out === false) {
                throw new \RuntimeException("couldn't create {$target}");
            }
            @chmod($target, 0600);
            $copied = stream_copy_to_stream($in, $out);
            if (! fclose($out) || $copied !== $expected) {
                throw new \RuntimeException("{$target}: copied {$copied} of {$expected} bytes");
            }
        } finally {
            fclose($in);
            if (is_resource($out)) {
                fclose($out);
            }
        }
    }

    /**
     * A PHP fatal skips spatie's cleanup; this still removes the plaintext
     * copies and the SQL dump. Each scheduled run is its own process, and
     * spatie deletes this same folder at the end of every run anyway. Once
     * per process: spatie's retry fires the listener again.
     */
    private static function cleanUpOnFatalError(string $root): void
    {
        if (! self::$cleanupRegistered) {
            self::$cleanupRegistered = true;
            register_shutdown_function(fn () => File::deleteDirectory($root));
        }
    }
}
