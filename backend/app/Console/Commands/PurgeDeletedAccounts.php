<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Uploads;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PurgeDeletedAccounts extends Command
{
    protected $signature = 'accounts:purge-deleted';

    protected $description = 'Permanently delete accounts whose deletion grace period has passed.';

    public function handle(): int
    {
        $due = User::whereNotNull('deletion_requested_at')
            ->where('deletion_requested_at', '<=', now()->subDays(User::DELETION_GRACE_DAYS))
            ->get();

        $purged = 0;
        foreach ($due as $user) {
            try {
                $this->purge($user);
                $purged++;
            } catch (\Throwable $e) {
                // One failing account must not block the rest of the sweep.
                Log::error('Account purge failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            }
        }

        $this->info("Purged {$purged} of {$due->count()} due account(s).");

        return self::SUCCESS;
    }

    /**
     * DB foreign keys cascade the rows, but cascades bypass Eloquent events —
     * so anything owning a file on disk is deleted through its model first
     * (Pet::deleting removes the avatar + document files + lost-pet posts;
     * Post::deleting removes the image), then the user row cascades the rest
     * (memberships, invites, comments, paws, reminders, device/refresh
     * tokens, reset codes, support messages, post reports).
     */
    private function purge(User $user): void
    {
        foreach ($user->pets()->get() as $pet) {
            $pet->delete();
        }

        foreach ($user->posts()->get() as $post) {
            $post->delete();
        }

        Uploads::deleteByUrl($user->avatar_url);

        $user->delete();
    }
}
