<?php

namespace App\Support;

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

    /** What the app writes there: 40 random characters and the extension of a re-encoded image (or a PDF). */
    private const KEY_PATTERNS = [
        'r2-media' => '#^uploads/[A-Za-z0-9]{40}\.(?:jpe?g|png|webp|gif)$#D',
        'r2-documents' => '#^documents/[A-Za-z0-9]{40}\.(?:jpe?g|png|webp|gif|pdf)$#D',
    ];

    /** Medical records first: when not everything fits, they matter most. */
    private const PRIORITY = ['r2-documents', 'r2-media'];

    /** Free space kept beyond the staged copies and the zip. */
    private const DISK_MARGIN_BYTES = 100 * 1048576;

    /**
     * Copy every object on the remote upload disks next to the manifest and
     * add them to it; in the archive they sit under `<disk>/<key>`. Each
     * bucket goes in whole or not at all, documents first. A bucket that
     * can't be listed, read in full, or fit under the size limit or on disk
     * is logged (Sentry) and left out: an R2 outage, or one user's flood of
     * uploads, must not also cost the night's database backup.
     */
    public static function addToManifest(Manifest $manifest): void
    {
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
        foreach ($disks as $name) {
            try {
                $disk = Storage::disk($name);
                $objects = self::listObjects($disk, $name);
                $bytes = array_sum($objects);
                self::assertRoom($name, $bytes, $budget, $root);
                $staged = self::stage($disk, $name, $objects, $root);
            } catch (Throwable $e) {
                File::deleteDirectory($root.DIRECTORY_SEPARATOR.$name);
                Log::error('Backup is missing uploads', ['disk' => $name, 'error' => $e->getMessage()]);

                continue;
            }
            $budget -= $bytes;
            $manifest->addFiles($staged);
            backupLogger()->info('Added '.count($staged).' file(s) ('.round($bytes / 1048576, 1)." MB) from {$name}.");
        }
    }

    /** @return list<string> the configured upload disks that live on R2. */
    public static function remoteDisks(): array
    {
        $disks = array_unique([Uploads::publicDiskName(), Uploads::privateDiskName()]);

        return array_values(array_filter($disks, fn (string $name) => isset(self::DIRS[$name])));
    }

    /** A file name the app itself writes: nothing can climb out of the temp or restore folder, and nothing but images and PDFs reaches a bucket. */
    public static function isSafeKey(string $disk, string $key): bool
    {
        return isset(self::KEY_PATTERNS[$disk]) && preg_match(self::KEY_PATTERNS[$disk], $key) === 1;
    }

    /** The staging folder of a run that was killed before spatie could delete it. */
    public static function stagingRoot(): string
    {
        return rtrim((string) config('backup.backup.temporary_directory'), '/\\').DIRECTORY_SEPARATOR.'temp';
    }

    /** @return array<string, int> the disk's safe keys and their sizes */
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
            $objects[$item->path()] = $item->fileSize() ?? $disk->size($item->path());
        }

        return $objects;
    }

    private static function assertRoom(string $name, int $bytes, int $budget, string $root): void
    {
        if ($bytes > $budget) {
            throw new \RuntimeException(sprintf(
                '%s holds %.1f MB, over what is left of BACKUP_UPLOADS_MAX_MB (%.1f of %d MB); raise it with the backup storage caps (docs/backups.md)',
                $name, $bytes / 1048576, max(0, $budget) / 1048576, (int) config('backup.uploads.max_megabytes'),
            ));
        }

        // The staged copies plus the zip of them. This sees the filesystem,
        // not a cPanel account quota; the size limit is what bounds that.
        $free = @disk_free_space($root);
        if ($free !== false && $free < 2 * $bytes + self::DISK_MARGIN_BYTES) {
            throw new \RuntimeException(sprintf(
                'not enough free disk for %.1f MB of uploads (%.1f MB free)', $bytes / 1048576, $free / 1048576,
            ));
        }
    }

    /**
     * @param  array<string, int>  $objects
     * @return list<string> the staged copies
     */
    private static function stage(Filesystem $disk, string $name, array $objects, string $root): array
    {
        $staged = [];
        foreach ($objects as $key => $size) {
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
     * spatie deletes this same folder at the end of every run anyway.
     */
    private static function cleanUpOnFatalError(string $root): void
    {
        register_shutdown_function(fn () => File::deleteDirectory($root));
    }
}
