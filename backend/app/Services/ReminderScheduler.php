<?php

namespace App\Services;

use App\Models\Reminder;
use App\Models\Vaccination;
use Illuminate\Support\Carbon;

class ReminderScheduler
{
    /**
     * Compute the next absolute (UTC) instant a reminder should fire, or null
     * if it never fires again. Timezone-correct via the reminder's IANA zone.
     */
    public static function computeNextFireAt(Reminder $reminder): ?Carbon
    {
        if (! $reminder->enabled) {
            return null;
        }

        if ($reminder->schedule_type === 'one_time') {
            if (! $reminder->fire_at || $reminder->last_fired_at) {
                return null; // no target, or already fired once
            }
            // Notify `lead_time_days` before the event. A past result is fine —
            // the job will fire it immediately as a catch-up.
            return $reminder->fire_at->copy()->subDays($reminder->lead_time_days ?? 0);
        }

        // recurring
        $tz = $reminder->timezone ?: 'UTC';
        [$h, $m] = array_pad(explode(':', $reminder->time_of_day ?: '09:00'), 2, '0');

        $now = Carbon::now($tz);
        $candidate = $now->copy()->setTime((int) $h, (int) $m, 0);
        $last = $reminder->last_fired_at ? $reminder->last_fired_at->copy()->setTimezone($tz) : null;

        $guard = 0;
        while (
            $candidate->lessThanOrEqualTo($now) ||
            ($last && $candidate->lessThanOrEqualTo($last))
        ) {
            $candidate = self::advance($candidate, $reminder->recurrence);
            if (++$guard > 480) {
                break; // safety valve (~16 months of daily steps)
            }
        }

        return $candidate->copy()->utc();
    }

    /**
     * Create or update the vaccination reminder for a given vaccination.
     * Default: notify 7 days before the due date at 09:00 in the owner's timezone.
     */
    public static function syncVaccinationReminder(Vaccination $vax): ?Reminder
    {
        $pet = $vax->pet()->with('owner')->first();
        if (! $pet || ! $pet->owner) {
            return null;
        }

        $user = $pet->owner;
        $tz = $user->timezone ?: 'UTC';
        $fireAt = Carbon::parse($vax->due_date->format('Y-m-d'), $tz)->setTime(9, 0, 0)->utc();

        $reminder = Reminder::updateOrCreate(
            ['related_type' => 'vaccination', 'related_id' => $vax->id],
            [
                'user_id' => $user->id,
                'pet_id' => $pet->id,
                'type' => 'vaccination',
                'title' => 'Vaccination due: '.$vax->name,
                'body' => $pet->name.' — '.$vax->name.' is due '.$vax->due_date->format('M j, Y'),
                'schedule_type' => 'one_time',
                'fire_at' => $fireAt,
                'lead_time_days' => 7,
                'time_of_day' => '09:00',
                'timezone' => $tz,
                'enabled' => true,
                'last_fired_at' => null,
            ],
        );

        $reminder->next_fire_at = self::computeNextFireAt($reminder);
        $reminder->save();

        return $reminder;
    }

    /** Disable the reminder(s) tied to a vaccination (e.g. once administered/deleted). */
    public static function cancelVaccinationReminder(Vaccination $vax): void
    {
        Reminder::where('related_type', 'vaccination')
            ->where('related_id', $vax->id)
            ->update(['enabled' => false, 'next_fire_at' => null]);
    }

    private static function advance(Carbon $dt, ?string $recurrence): Carbon
    {
        return match ($recurrence) {
            'weekly' => $dt->copy()->addWeek(),
            'monthly' => $dt->copy()->addMonthNoOverflow(),
            default => $dt->copy()->addDay(),
        };
    }
}
