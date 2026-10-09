<?php

namespace App\Console\Commands;

use App\Models\RevenueCatEvent;
use App\Models\User;
use App\Models\UserEntitlement;
use App\Services\Subscriptions\EntitlementSync;
use App\Services\Subscriptions\EntitlementWriter;
use App\Support\ReportOnce;
use App\Support\SentryScrubber;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Keeps user_entitlements in step with RevenueCat when webhooks alone can't:
 *
 * - every run: re-applies webhook events that failed (or never got applied),
 *   and syncs from RevenueCat's API every user named by an event the webhook
 *   left for the sync (needs_sync: transfers — BOTH sides — plan changes,
 *   same-instant conflicts). Those rows end as status "synced".
 * - --sweep (daily): re-syncs users whose access is about to change or is in
 *   doubt (expiring, billing issue, grace period), then prunes processed
 *   ledger rows older than 90 days.
 *
 * Syncing needs REVENUECAT_SECRET_KEY + REVENUECAT_PROJECT_ID; without them
 * only the re-apply step runs and needs_sync rows wait.
 */
class ReconcileRevenueCat extends Command
{
    protected $signature = 'subscriptions:reconcile {--sweep : Also re-sync users near expiry or with billing issues, and prune the ledger}';

    protected $description = 'Retry failed RevenueCat events and sync entitlements from the RevenueCat API.';

    /** A failing event is retried this many times, then left for a human. */
    public const MAX_ATTEMPTS = 10;

    /** Don't race a webhook that is still being processed. */
    private const SETTLE_MINUTES = 2;

    public const PRUNE_AFTER_DAYS = 90;

    /** Users synced per run (RevenueCat allows 480 requests/minute; a sync makes 2+). */
    private const SYNC_BUDGET = 150;

    private int $budget = self::SYNC_BUDGET;

    /** @var array<string, bool> users already synced this run */
    private array $synced = [];

    private bool $revenueCatDown = false;

    public function handle(EntitlementWriter $writer, EntitlementSync $sync): int
    {
        $retried = $this->retryUnapplied($writer);
        $resolved = $sync->configured() ? $this->resolveNeedsSync($sync) : 0;
        $this->info("Re-applied {$retried} event(s); resolved {$resolved} sync event(s).");

        if ($this->option('sweep')) {
            $swept = $sync->configured() ? $this->sweep($sync) : 0;
            $pruned = $this->prune();
            $this->info("Swept {$swept} user(s); pruned {$pruned} ledger row(s).");
        }

        return self::SUCCESS;
    }

    private function retryUnapplied(EntitlementWriter $writer): int
    {
        $rows = RevenueCatEvent::whereNull('processed_at')
            ->whereIn('status', ['pending', 'failed'])
            ->where('received_at', '<', now()->subMinutes(self::SETTLE_MINUTES))
            ->where('attempts', '<', self::MAX_ATTEMPTS)
            ->orderBy('received_at')
            ->limit(200)
            ->pluck('id');

        $count = 0;
        foreach ($rows as $id) {
            try {
                $writer->process($id);
                $count++;
            } catch (\Throwable $e) {
                report($e);
                RevenueCatEvent::whereKey($id)->update([
                    'status' => 'failed',
                    'attempts' => DB::raw('attempts + 1'),
                    'error' => mb_strcut(SentryScrubber::scrubText(class_basename($e).': '.$e->getMessage()), 0, 255),
                ]);
            }
        }

        $stuck = RevenueCatEvent::whereNull('processed_at')->where('attempts', '>=', self::MAX_ATTEMPTS)->count();
        if ($stuck > 0) {
            ReportOnce::log('revenuecat-reconcile:stuck', 'error', "{$stuck} RevenueCat event(s) failed ".self::MAX_ATTEMPTS.' times and are no longer retried; see revenuecat_events.error.', 86400);
        }

        return $count;
    }

    private function resolveNeedsSync(EntitlementSync $sync): int
    {
        $rows = RevenueCatEvent::whereNull('processed_at')
            ->where('status', 'needs_sync')
            ->where('received_at', '<', now()->subMinutes(self::SETTLE_MINUTES))
            ->orderBy('received_at')
            ->limit(100)
            ->pluck('id');

        $count = 0;
        foreach ($rows as $id) {
            // Every one of our users the event names, any role — a transfer
            // must re-sync the side that lost the purchase too.
            $userIds = DB::table('revenuecat_event_users')->where('event_id', $id)->distinct()->pluck('user_id');
            $done = true;
            foreach ($userIds as $userId) {
                if (! $this->syncUser($sync, $userId)) {
                    $done = false;
                    break;
                }
            }
            if ($this->revenueCatDown) {
                break;
            }
            if ($done) {
                RevenueCatEvent::whereKey($id)->update([
                    'processed_at' => now(),
                    'status' => $userIds->isEmpty() ? 'unknown_user' : 'synced',
                ]);
                $count++;
            }
        }

        return $count;
    }

    private function sweep(EntitlementSync $sync): int
    {
        $userIds = UserEntitlement::query()
            ->where(fn ($q) => $q->whereNotNull('billing_issue_at')
                ->orWhere('grace_expires_at', '>', now()->subDay())
                ->orWhereBetween('expires_at', [now()->subDay(), now()->addDays(2)]))
            ->distinct()
            ->limit(self::SYNC_BUDGET)
            ->pluck('user_id');

        $count = 0;
        foreach ($userIds as $userId) {
            if ($this->revenueCatDown || $this->budget <= 0) {
                break;
            }
            $this->syncUser($sync, $userId) && $count++;
        }

        return $count;
    }

    /** True once the user is in sync (or no longer exists). */
    private function syncUser(EntitlementSync $sync, string $userId): bool
    {
        if (isset($this->synced[$userId])) {
            return true;
        }
        if ($this->revenueCatDown || $this->budget <= 0) {
            return false;
        }
        $user = User::find($userId);
        if (! $user) {
            return $this->synced[$userId] = true;
        }

        $this->budget--;
        if (! $sync->sync($user)) {
            $this->revenueCatDown = true; // stop for this run; retry next time

            return false;
        }

        return $this->synced[$userId] = true;
    }

    private function prune(): int
    {
        $pruned = 0;
        do {
            $ids = RevenueCatEvent::whereNotNull('processed_at')
                ->where('received_at', '<', now()->subDays(self::PRUNE_AFTER_DAYS))
                ->limit(500)
                ->pluck('id');
            $pruned += $ids->isEmpty() ? 0 : RevenueCatEvent::whereIn('id', $ids)->delete(); // links cascade
        } while ($ids->count() === 500);

        return $pruned;
    }
}
