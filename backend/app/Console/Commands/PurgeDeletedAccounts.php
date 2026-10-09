<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PurgeDeletedAccounts extends Command
{
    protected $signature = 'accounts:purge-deleted';

    protected $description = 'Permanently delete accounts whose deletion grace period has passed.';

    /**
     * How long a failing third-party deletion (PostHog) may hold up a purge.
     * Past that, the account is purged locally anyway and the leftover is
     * logged as an error for manual follow-up.
     */
    public const THIRD_PARTY_RETRY_DAYS = 7;

    public function handle(ProductAnalytics $analytics): int
    {
        $due = User::whereNotNull('deletion_requested_at')
            ->where('deletion_requested_at', '<=', now()->subDays(User::DELETION_GRACE_DAYS))
            ->get();

        $purged = 0;
        $posthogDown = false;
        foreach ($due as $user) {
            // Erase the person's product-analytics data first, while we still
            // know their id. A failure skips the account (retried by the next
            // daily run) until the retry window is over. After one failure the
            // rest of this run doesn't call PostHog again, so an outage can't
            // add a timeout per account to the nightly schedule.
            $erased = ! $posthogDown && $analytics->deletePerson((string) $user->id);
            if (! $erased) {
                $posthogDown = true;
                $giveUpAt = $user->deletion_requested_at->copy()
                    ->addDays(User::DELETION_GRACE_DAYS + self::THIRD_PARTY_RETRY_DAYS);
                if (now()->lt($giveUpAt)) {
                    continue;
                }
                Log::error('PostHog deletion kept failing; purging the account locally anyway', ['user_id' => $user->id]);
            }

            try {
                // Re-check under a lock: the sweep can take a while, and a user
                // who logged back in meanwhile (cancelling the deletion) must
                // never be purged from the stale list.
                $stillDue = DB::transaction(function () use ($user) {
                    $current = User::whereKey($user->id)
                        ->whereNotNull('deletion_requested_at')
                        ->where('deletion_requested_at', '<=', now()->subDays(User::DELETION_GRACE_DAYS))
                        ->lockForUpdate()
                        ->first();
                    if ($current) {
                        $this->purge($current);
                    }

                    return $current !== null;
                });
                if (! $stillDue) {
                    continue;
                }
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
     * (Pet's delete hooks remove the avatar + document files + lost-pet posts;
     * Post's remove the image), then the user row cascades the rest
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

        // Clear the avatar while the user row still exists: the User `updated`
        // hook then removes the file if nothing else references it. (Deleting
        // the row first would leave the purged user's own row as the last
        // reference until it's gone.)
        if ($user->avatar_url !== null) {
            $user->forceFill(['avatar_url' => null])->save();
        }

        $user->delete();
    }
}
