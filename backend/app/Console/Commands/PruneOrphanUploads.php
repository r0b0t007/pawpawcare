<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\Pet;
use App\Models\Post;
use App\Models\User;
use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

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
            ->map(fn ($url) => Uploads::pathFromUrl($url))
            ->filter()
            ->flip();
        $deleted += $this->prune(Storage::disk('public'), 'uploads', $publicRefs, $cutoff);

        // Private disk: medical documents under documents/ (paths stored verbatim).
        $docRefs = Document::whereNotNull('file_path')->pluck('file_path')->flip();
        $deleted += $this->prune(Storage::disk(Uploads::PRIVATE_DISK), 'documents', $docRefs, $cutoff);

        $this->info("Pruned {$deleted} orphaned file(s).");

        return self::SUCCESS;
    }

    /** Delete files in $dir on $disk that aren't referenced and are older than $cutoff. */
    private function prune($disk, string $dir, $referenced, int $cutoff): int
    {
        $deleted = 0;
        foreach ($disk->files($dir) as $path) {
            if ($referenced->has($path) || $disk->lastModified($path) > $cutoff) {
                continue;
            }
            $disk->delete($path);
            $deleted++;
        }

        return $deleted;
    }
}
