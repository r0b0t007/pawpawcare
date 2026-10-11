<?php

namespace App\Console\Commands;

use App\Support\Uploads;
use App\Support\UploadsBackup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * Puts R2 upload files back from an unzipped backup (docs/backups.md,
 * "Restoring"). Only files a record in the current database points at, so
 * photos users deleted since the backup don't become public again; and never
 * overwriting, so an object still on R2 is left as it is.
 */
class RestoreUploads extends Command
{
    protected $signature = 'uploads:restore
        {path : Folder of an unzipped backup, holding r2-media/ and/or r2-documents/}
        {--dry-run : Only list what would be restored}
        {--include-unreferenced : Also restore files no record points at (uploads:prune removes them again)}';

    protected $description = 'Restore missing R2 upload files from an unzipped backup, never overwriting.';

    /** Extensions a browser would render or run if served from media.pawpawcare.app. */
    private const ACTIVE_CONTENT = '#\.(?:html?|xhtml|svg|xml|js|mjs)$#i';

    public function handle(): int
    {
        $root = realpath((string) $this->argument('path'));
        if ($root === false || ! is_dir($root)) {
            $this->error("Not a folder: {$this->argument('path')}");

            return self::FAILURE;
        }

        try {
            $remote = UploadsBackup::remoteDisks();
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $dry = (bool) $this->option('dry-run');
        $all = (bool) $this->option('include-unreferenced');
        $restored = $present = $unreferenced = $skipped = 0;
        foreach (array_keys(UploadsBackup::DIRS) as $name) {
            $source = $root.DIRECTORY_SEPARATOR.$name;
            if (! is_dir($source)) {
                continue;
            }
            if (is_link($source) || realpath($source) !== $source) {
                $this->error("{$name}/ is a link, not a folder of the backup.");

                return self::FAILURE;
            }
            if (! in_array($name, $remote, true)) {
                $this->error("The backup holds {$name}/ but uploads don't use {$name}; copy those files by hand (docs/backups.md).");

                return self::FAILURE;
            }
            $disk = Storage::disk($name);
            $referenced = $all ? null : $this->referenced($name);

            foreach (File::allFiles($source) as $file) {
                $key = str_replace(DIRECTORY_SEPARATOR, '/', $file->getRelativePathname());
                // Only regular files inside the folder: a symlink could point at .env.
                $real = realpath($file->getPathname());
                if ($file->isLink() || $real === false || ! str_starts_with($real, $source.DIRECTORY_SEPARATOR)
                    || ! UploadsBackup::isSafeKey($name, $key)) {
                    $this->warn("Skipped {$name}/{$key}: not a file the app writes.");
                    $skipped++;

                    continue;
                }
                if ($referenced !== null && ! isset($referenced[$key])) {
                    $unreferenced++;

                    continue;
                }
                // Unreferenced files bypass the record check, so nothing a
                // browser would run may land on the public media domain.
                if ($referenced === null && preg_match(self::ACTIVE_CONTENT, $key)) {
                    $this->warn("Skipped {$name}/{$key}: a browser could run it.");
                    $skipped++;

                    continue;
                }
                if ($disk->exists($key)) {
                    $present++;

                    continue;
                }
                $this->line(($dry ? 'Would restore' : 'Restoring')." {$name}:{$key}");
                if ($dry) {
                    $restored++;

                    continue;
                }

                $stream = fopen($real, 'rb');
                try {
                    $disk->writeStream($key, $stream);
                } finally {
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                }
                if ($disk->size($key) !== $file->getSize()) {
                    // Remove it, or a rerun would count the bad copy as "already on R2".
                    $disk->delete($key);
                    $this->error("{$name}:{$key}: size on R2 didn't match the backup copy, so it was removed again; re-run to retry.");

                    return self::FAILURE;
                }
                $restored++;
            }
        }

        $this->info(sprintf(
            '%s %d file(s); %d already on R2 and left alone; %d no record points at%s; %d skipped.',
            $dry ? 'Would restore' : 'Restored', $restored, $present, $unreferenced,
            $all ? '' : ' (left out)', $skipped,
        ));

        return self::SUCCESS;
    }

    /** @return array<string, mixed> keys on this disk that the current database points at */
    private function referenced(string $disk): array
    {
        return $disk === 'r2-documents' ? Uploads::referencedDocumentPaths() : Uploads::referencedPublicPaths();
    }
}
