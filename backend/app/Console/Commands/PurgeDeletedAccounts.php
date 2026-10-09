<?php

namespace App\Console\Commands;

use App\Models\RevenueCatEvent;
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
        $due = User::dueForPurge()->orderBy('deletion_requested_at')->get();

        $purged = 0;
        $posthogDown = false;
        foreach ($due as $listed) {
            // Re-check before touching anything: the sweep can take a while,
            // and a user who logged back in since the list was loaded (which
            // cancels the deletion) must keep both their account and their
            // analytics history.
            $user = User::whereKey($listed->id)->dueForPurge()->first();
            if (! $user) {
                continue;
            }

            $giveUpAt = $user->deletion_requested_at->copy()
                ->addDays(User::DELETION_GRACE_DAYS + self::THIRD_PARTY_RETRY_DAYS);
            $pastRetryWindow = now()->gte($giveUpAt);

            // Erase the person's product-analytics data first, while we still
            // know their id. During a PostHog outage the rest of the run stops
            // calling it (no timeout per account); those accounts retry
            // tomorrow — except ones out of retry window, which still get
            // their attempt before being purged.
            if ($posthogDown && ! $pastRetryWindow) {
                continue;
            }
            $result = $analytics->deletePerson((string) $user->id);
            if ($result === ProductAnalytics::DELETE_UNAVAILABLE) {
                $posthogDown = true;
            }
            if ($result !== ProductAnalytics::DELETE_OK) {
                if (! $pastRetryWindow) {
                    continue;
                }
                Log::error('PostHog deletion kept failing; purging the account locally anyway', ['user_id' => $user->id]);
            }

            try {
                // The PostHog call can take seconds: re-check under the row
                // lock and delete in the same transaction. A concurrent login
                // (User::cancelPendingDeletion) waits for the lock, then finds
                // the account gone and is rejected — it can never be told
                // "restored" and then lose the account. File deletes are
                // deferred to after commit (Uploads), so a rollback leaves
                // everything consistent.
                $stillDue = DB::transaction(function () use ($user) {
                    $current = User::whereKey($user->id)->dueForPurge()->lockForUpdate()->first();
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

        // The subscription event ledger has no FK (events can name unknown
        // users): drop every row linked to OR naming this user (customer ids,
        // aliases, transfers). UUIDs contain no LIKE wildcards.
        // user_entitlements cascades with the user row.
        RevenueCatEvent::where('user_id', $user->id)
            ->orWhere('payload', 'like', '%'.$user->id.'%')
            ->delete();

        $user->delete();
    }
}
