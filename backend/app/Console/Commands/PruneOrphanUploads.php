<?php

namespace App\Console\Commands;

use App\Models\Pet;
use App\Models\Post;
use App\Models\User;
use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneOrphanUploads extends Command
{
    protected $signature = 'uploads:prune {--hours=24 : Keep unreferenced files newer than this many hours}';

    protected $description = 'Delete uploaded images not referenced by any pet, user, or post (e.g. abandoned picks).';

    public function handle(): int
    {
        $disk = Storage::disk('public');

        // Paths still referenced anywhere.
        $referenced = collect()
            ->merge(Pet::whereNotNull('avatar_url')->pluck('avatar_url'))
            ->merge(User::whereNotNull('avatar_url')->pluck('avatar_url'))
            ->merge(Post::whereNotNull('image_url')->pluck('image_url'))
            ->map(fn ($url) => Uploads::pathFromUrl($url))
            ->filter()
            ->flip();

        // Keep files newer than this so an upload that hasn't been saved yet survives.
        $cutoff = now()->subHours((int) $this->option('hours'))->getTimestamp();
        $deleted = 0;

        foreach ($disk->files('uploads') as $path) {
            if ($referenced->has($path) || $disk->lastModified($path) > $cutoff) {
                continue;
            }
            $disk->delete($path);
            $deleted++;
        }

        $this->info("Pruned {$deleted} orphaned upload(s).");

        return self::SUCCESS;
    }
}
