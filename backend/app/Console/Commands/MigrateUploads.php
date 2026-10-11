<?php

namespace App\Console\Commands;

use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * One-time move of existing uploads from the local disks to the configured
 * upload disks (R2), run right after switching UPLOADS_PUBLIC_DISK /
 * UPLOADS_PRIVATE_DISK (docs/uploads-r2.md). Safe to re-run: files already on
 * R2 are copied again, and a local copy is deleted only once every copy is
 * verified and no record still reaches it through a /storage/ url.
 */
class MigrateUploads extends Command
{
    protected $signature = 'uploads:migrate {--dry-run : Only list what would move}';

    protected $description = 'Move existing uploads from the local disks to the configured upload disks (R2) and rewrite stored image urls.';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        try {
            $publicTo = Uploads::publicDiskName();
            $privateTo = Uploads::privateDiskName();
            Uploads::publicUrl('uploads/probe'); // fails early when r2-media has no MEDIA_URL
        } catch (\RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        if ($publicTo === 'public' && $privateTo === 'local') {
            $this->info('Uploads use the local disks; nothing to migrate.');

            return self::SUCCESS;
        }

        // 1. Copy and verify. Nothing local is touched yet.
        $copied = [];
        foreach ([['public', $publicTo, 'uploads'], ['local', $privateTo, 'documents']] as [$fromName, $toName, $dir]) {
            if ($fromName === $toName) {
                continue;
            }
            $from = Storage::disk($fromName);
            $to = Storage::disk($toName);

            foreach ($from->allFiles($dir) as $path) {
                $this->line(($dry ? 'Would move' : 'Moving')." {$fromName}:{$path} to {$toName}");
                if ($dry) {
                    continue;
                }

                $stream = $from->readStream($path);
                try {
                    $to->writeStream($path, $stream);
                } finally {
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                }
                if ($to->size($path) !== $from->size($path)) {
                    $this->error("{$path}: size on {$toName} doesn't match the local file; nothing was deleted.");

                    return self::FAILURE;
                }
                $copied[] = [$from, $path, $fromName];
            }
        }

        // 2. Point records at the new urls.
        $rewritten = $publicTo === 'public' ? 0 : $this->rewriteUrls($dry);

        // 3. Only now remove the local copies, except any a record still
        //    reaches through /storage/... in a form the rewrite left alone
        //    (an absolute https://api.../storage/... url, an odd name): that
        //    file stays served locally until someone fixes the record.
        $stillLocal = $publicTo === 'public' ? [] : $this->pathsStillServedLocally();
        $kept = 0;
        foreach ($copied as [$from, $path, $fromName]) {
            if ($fromName === 'public' && isset($stillLocal[$path])) {
                $kept++;

                continue;
            }
            $from->delete($path);
        }
        if ($kept > 0) {
            $this->warn("Kept {$kept} local file(s) that records still point at through /storage/...: update those records, then re-run.");
        }

        $this->info(sprintf(
            '%s %d file(s) and %s %d stored image url(s).',
            $dry ? 'Would move' : 'Moved', $dry ? $this->countLocal($publicTo, $privateTo) : count($copied),
            $dry ? 'would rewrite' : 'rewrote', $rewritten,
        ));

        return self::SUCCESS;
    }

    /** @return array<string, true> public-disk paths some record reaches via a /storage/ url. */
    private function pathsStillServedLocally(): array
    {
        $paths = [];
        foreach (Uploads::URL_COLUMNS as $model => $column) {
            $table = (new $model)->getTable();
            foreach (DB::table($table)->where($column, 'like', '%/storage/%')->pluck($column) as $url) {
                $rest = substr($url, strpos($url, '/storage/') + strlen('/storage/'));
                $paths[strtok($rest, '?#')] = true;
            }
        }

        return $paths;
    }

    /** Rewrite /storage/uploads/... urls to MEDIA_URL/uploads/... (Uploads::canonicalUrl). */
    private function rewriteUrls(bool $dry): int
    {
        $count = 0;
        foreach (Uploads::URL_COLUMNS as $model => $column) {
            $table = (new $model)->getTable();
            // lazyById pages by id, so rows that stop matching don't shift the pages.
            DB::table($table)->select('id', $column)->where($column, 'like', '/storage/uploads/%')->lazyById(200)
                ->each(function ($row) use ($table, $column, $dry, &$count) {
                    $url = Uploads::canonicalUrl($row->{$column});
                    if ($url === $row->{$column}) {
                        return; // not a shape the app generates; left alone
                    }
                    if (! $dry) {
                        // Query builder, not models: no update hooks may delete the file.
                        DB::table($table)->where('id', $row->id)->where($column, $row->{$column})->update([$column => $url]);
                    }
                    $count++;
                });
        }

        return $count;
    }

    private function countLocal(string $publicTo, string $privateTo): int
    {
        return ($publicTo === 'public' ? 0 : count(Storage::disk('public')->allFiles('uploads')))
            + ($privateTo === 'local' ? 0 : count(Storage::disk('local')->allFiles('documents')));
    }
}
