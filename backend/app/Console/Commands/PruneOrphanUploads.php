<?php

namespace App\Console\Commands;

use App\Models\Upload;
use App\Support\Uploads;
use Illuminate\Console\Command;

class PruneOrphanUploads extends Command
{
    protected $signature = 'uploads:prune {--hours=24 : Keep unreferenced files newer than this many hours}';

    protected $description = 'Delete stored files not referenced by any pet, user, post, or document (e.g. abandoned picks).';

    public function handle(): int
    {
        // Keep files newer than this so an upload that hasn't been saved yet survives.
        $cutoff = now()->subHours((int) $this->option('hours'))->getTimestamp();
        $deleted = 0;

        // A half-configured R2 setup (no MEDIA_URL) means nothing about the
        // stored urls can be trusted; delete nothing.
        try {
            Uploads::publicUrl('uploads/probe');
            Uploads::privateDiskName();
        } catch (\RuntimeException $e) {
            $this->error("Not pruning: {$e->getMessage()}");

            return self::FAILURE;
        }

        // Public disk: avatars + post images under uploads/ (see Uploads::referencedPath).
        $publicRefs = collect(Uploads::referencedPublicPaths());
        $deleted += $this->prune(Uploads::publicDisk(), 'uploads', $publicRefs, $cutoff, fn ($path) => Upload::where('path', $path)->delete());

        // Private disk: medical documents under documents/ (paths stored verbatim).
        $docRefs = collect(Uploads::referencedDocumentPaths());
        $deleted += $this->prune(Uploads::privateDisk(), 'documents', $docRefs, $cutoff);

        $this->info("Pruned {$deleted} orphaned file(s).");

        return self::SUCCESS;
    }

    /**
     * Delete files in $dir on $disk that aren't referenced and are older than
     * $cutoff. Prune is the backstop for deletes that failed elsewhere, so one
     * bad object (an R2 error) is reported and skipped, never fatal.
     */
    private function prune($disk, string $dir, $referenced, int $cutoff, ?callable $afterDelete = null): int
    {
        $deleted = 0;
        try {
            $paths = $disk->files($dir);
        } catch (\Throwable $e) {
            report($e);
            $this->warn("Couldn't list {$dir}/: {$e->getMessage()}");

            return 0;
        }

        foreach ($paths as $path) {
            try {
                if ($referenced->has($path) || $disk->lastModified($path) > $cutoff) {
                    continue;
                }
                $disk->delete($path);
                if ($afterDelete) {
                    $afterDelete($path); // drop the ownership row with the file
                }
                $deleted++;
            } catch (\Throwable $e) {
                report($e);
                $this->warn("Skipped {$path}: {$e->getMessage()}");
            }
        }

        return $deleted;
    }
}
