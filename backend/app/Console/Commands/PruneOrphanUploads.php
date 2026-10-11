<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use App\Models\Upload;
use App\Models\User;
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

        // Public disk: avatars + post images under uploads/.
        $publicRefs = collect()
            ->merge(Pet::whereNotNull('avatar_url')->pluck('avatar_url'))
            ->merge(User::whereNotNull('avatar_url')->pluck('avatar_url'))
            ->merge(Post::whereNotNull('image_url')->pluck('image_url'))
            ->merge(LostPetReport::whereNotNull('photo_url')->pluck('photo_url'))
            ->map(fn ($url) => Uploads::pathFromUrl($url))
            ->filter()
            ->flip();
        $deleted += $this->prune(Uploads::publicDisk(), 'uploads', $publicRefs, $cutoff, fn ($path) => Upload::where('path', $path)->delete());

        // Private disk: medical documents under documents/ (paths stored verbatim).
        $docRefs = Document::whereNotNull('file_path')->pluck('file_path')->flip();
        $deleted += $this->prune(Uploads::privateDisk(), 'documents', $docRefs, $cutoff);

        $this->info("Pruned {$deleted} orphaned file(s).");

        return self::SUCCESS;
    }

    /** Delete files in $dir on $disk that aren't referenced and are older than $cutoff. */
    private function prune($disk, string $dir, $referenced, int $cutoff, ?callable $afterDelete = null): int
    {
        $deleted = 0;
        foreach ($disk->files($dir) as $path) {
            if ($referenced->has($path) || $disk->lastModified($path) > $cutoff) {
                continue;
            }
            $disk->delete($path);
            if ($afterDelete) {
                $afterDelete($path); // drop the ownership row with the file
            }
            $deleted++;
        }

        return $deleted;
    }
}
