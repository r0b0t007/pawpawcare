<?php

namespace App\Console\Commands;

use App\Models\DeviceToken;
use App\Models\EngagementPush;
use App\Models\Pet;
use App\Models\User;
use App\Services\ExpoPushService;
use App\Support\GamificationRecap;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Hourly re-engagement pass. Every push is anchored to a real calendar event
 * about the user's real pet — birthdays, gotcha days (pets.adopted_on), and a
 * Sunday-evening weekly care recap that is suppressed entirely when there is
 * nothing to say (never "you did nothing this week").
 *
 * Runs hourly so each user is reached at a civil LOCAL hour via
 * users.timezone (synced from devices on every login): celebrations at
 * ~09:00, the recap at ~18:00 Sunday. The engagement_pushes unique key
 * (user, pet, kind, user-local date) makes reruns and DST double-hours no-ops.
 *
 * Server pushes only — deliberately outside scheduleLocalReminders, so the
 * app's cancel-all-then-reschedule local pipeline is never disturbed.
 */
class SendEngagementPushes extends Command
{
    protected $signature = 'engagement:send';

    protected $description = 'Send birthday / gotcha-day / weekly-recap pushes at users\' local hours.';

    private const CELEBRATION_HOUR = 9;

    private const RECAP_HOUR = 18; // Sunday

    public function handle(ExpoPushService $push): int
    {
        $sent = 0;

        // Only users who can receive anything: opted in, with a device.
        $userIds = DeviceToken::query()->distinct()->pluck('user_id');
        User::where('is_active', true)
            ->where('engagement_pushes_enabled', true)
            ->whereIn('id', $userIds)
            ->chunkById(200, function ($users) use ($push, &$sent) {
                foreach ($users as $user) {
                    $sent += $this->processUser($user, $push);
                }
            });

        $this->info("Sent {$sent} engagement push(es).");

        return self::SUCCESS;
    }

    private function processUser(User $user, ExpoPushService $push): int
    {
        $tz = in_array($user->timezone, timezone_identifiers_list(), true) ? $user->timezone : 'UTC';
        $localNow = CarbonImmutable::now($tz);
        $sent = 0;

        if ($localNow->hour === self::CELEBRATION_HOUR) {
            $sent += $this->sendCelebrations($user, $localNow, $push);
        }

        if ($localNow->isSunday() && $localNow->hour === self::RECAP_HOUR) {
            $sent += $this->sendRecap($user, $localNow, $push);
        }

        return $sent;
    }

    /** Birthday + gotcha-day pushes for every pet the user can access. */
    private function sendCelebrations(User $user, CarbonImmutable $localNow, ExpoPushService $push): int
    {
        $sent = 0;

        foreach (Pet::accessibleBy($user->id)->get() as $pet) {
            foreach (['birthday' => $pet->birthday, 'gotcha_day' => $pet->adopted_on] as $kind => $date) {
                if (! $date || ! $this->isAnniversaryToday($date, $localNow)) {
                    continue;
                }

                $years = max(0, $localNow->year - $date->year);
                [$title, $body] = $kind === 'birthday'
                    ? ["Happy birthday, {$pet->name}!", $years > 0 ? "{$pet->name} turns {$years} today." : "It's {$pet->name}'s day."]
                    : ['Gotcha day!', $years === 1 ? "One year with {$pet->name} today." : "{$years} years with {$pet->name} today."];

                $sent += $this->deliver($user, $pet->id, $kind, $localNow, $title, $body, $push);
            }
        }

        return $sent;
    }

    /**
     * Sunday-evening recap of the trailing week. Suppressed when the user
     * logged no care actions AND nothing needs attention — an empty recap is
     * noise, and "you did nothing" is the shame-push this feature forbids.
     */
    private function sendRecap(User $user, CarbonImmutable $localNow, ExpoPushService $push): int
    {
        $petIds = Pet::accessibleBy($user->id)->pluck('id');
        if ($petIds->isEmpty()) {
            return 0;
        }

        $recap = GamificationRecap::forPets($petIds);
        $actions = collect($recap['per_pet'])->sum(fn ($p) => $p['doses'] + $p['weights'] + $p['activities']);
        $needsAttention = collect($recap['per_pet'])->contains(fn ($p) => ! $p['vax_current']);

        if ($actions === 0 && ! $needsAttention) {
            return 0;
        }

        $petCount = count($recap['per_pet']);
        $body = $actions > 0
            ? "{$actions} care action".($actions === 1 ? '' : 's')." across {$petCount} pet".($petCount === 1 ? '' : 's').' this week.'
            : 'Some vaccinations could use a look.';

        return $this->deliver($user, null, 'weekly_recap', $localNow, 'Your week in care', $body, $push);
    }

    /** Idempotent send: the unique ledger row is claimed before pushing. */
    private function deliver(User $user, ?string $petId, string $kind, CarbonImmutable $localNow, string $title, string $body, ExpoPushService $push): int
    {
        $row = EngagementPush::firstOrCreate(
            ['user_id' => $user->id, 'pet_id' => $petId, 'kind' => $kind, 'occurrence_date' => $localNow->toDateString()],
            ['created_at' => now()],
        );

        if ($row->sent_at !== null) {
            return 0; // already delivered for this user-local date
        }

        $tokens = DeviceToken::where('user_id', $user->id)->pluck('token');
        if ($tokens->isNotEmpty()) {
            $push->send($tokens->map(fn ($t) => [
                'to' => $t,
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
                'channelId' => 'reminders',
                'data' => ['kind' => $kind, 'petId' => $petId, 'screen' => 'Home'],
            ])->all());
        }

        $row->sent_at = now();
        $row->save();

        return 1;
    }

    /**
     * Month-day anniversary match in the user's local calendar, with the
     * Feb 29 case celebrated on Mar 1 in non-leap years (a birthday every
     * four years is no birthday at all).
     */
    private function isAnniversaryToday($date, CarbonImmutable $localNow): bool
    {
        if ($localNow->year <= $date->year) {
            return false; // no anniversary in (or before) the origin year
        }
        if ($date->format('m-d') === $localNow->format('m-d')) {
            return true;
        }

        return $date->format('m-d') === '02-29'
            && ! $localNow->isLeapYear()
            && $localNow->format('m-d') === '03-01';
    }
}
