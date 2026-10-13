<?php

namespace App\Services;

use App\Models\Medication;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\User;
use App\Models\Vaccination;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

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
     * Create or update the vaccination reminder for everyone who can see the pet
     * (owner + co-owners), each in their own timezone. Default: notify 7 days
     * before the due date at 09:00 local.
     */
    public static function syncVaccinationReminder(Vaccination $vax): void
    {
        $pet = $vax->pet()->with(['owner', 'members'])->first();
        if (! $pet || ! $pet->owner) {
            return;
        }

        $recipients = self::petRecipients($pet);
        foreach ($recipients as $user) {
            self::upsertVaccinationReminderFor($vax, $pet, $user);
        }

        // Drop reminders for anyone no longer sharing the pet.
        Reminder::where('related_type', 'vaccination')
            ->where('related_id', $vax->id)
            ->whereNotIn('user_id', $recipients->pluck('id'))
            ->delete();
    }

    /** Upsert one user's reminder for a vaccination (keyed per user). */
    private static function upsertVaccinationReminderFor(Vaccination $vax, Pet $pet, User $user): void
    {
        $tz = $user->timezone ?: 'UTC';
        $fireAt = self::eventFireAt($vax->due_date->format('Y-m-d'), '09:00', $tz);

        $reminder = Reminder::updateOrCreate(
            ['related_type' => 'vaccination', 'related_id' => $vax->id, 'user_id' => $user->id],
            [
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
    }

    /**
     * Retire the reminder(s) tied to a vaccination once it's administered or
     * deleted, for every recipient. One that never fired is deleted outright.
     * One that already fired is only switched off: its notice lives in the
     * inbox through reminder_deliveries (which cascade on delete), and
     * /reminders hides these spent rows so they can't be switched back on.
     */
    public static function cancelVaccinationReminder(Vaccination $vax): void
    {
        $reminders = fn () => Reminder::where('related_type', 'vaccination')->where('related_id', $vax->id);

        $reminders()->whereNull('last_fired_at')->delete();
        $reminders()->update(['enabled' => false, 'next_fire_at' => null]);
    }

    /**
     * Rebuild the recurring reminders for a medication — one per dose time. A
     * medication can have several daily/weekly doses, so we replace rather than
     * upsert. `as_needed` or inactive medications get no reminders.
     */
    public static function syncMedicationReminder(Medication $med): void
    {
        // Replace any existing reminders for this medication.
        Reminder::where('related_type', 'medication')->where('related_id', $med->id)->delete();

        if (! $med->active || $med->frequency === 'as_needed') {
            return;
        }

        $pet = $med->pet()->with(['owner', 'members'])->first();
        if (! $pet || ! $pet->owner) {
            return;
        }

        // One set of dose reminders per person who can see the pet, in their tz.
        foreach (self::petRecipients($pet) as $user) {
            self::createMedicationRemindersFor($med, $pet, $user);
        }
    }

    /** Create one user's recurring dose reminders for a medication. */
    private static function createMedicationRemindersFor(Medication $med, Pet $pet, User $user): void
    {
        if (! $med->active || $med->frequency === 'as_needed') {
            return;
        }

        $tz = $user->timezone ?: 'UTC';
        $times = (is_array($med->times) && count($med->times)) ? $med->times : ['09:00'];
        $recurrence = in_array($med->frequency, ['daily', 'weekly', 'monthly'], true) ? $med->frequency : 'daily';

        foreach ($times as $time) {
            $reminder = Reminder::create([
                'user_id' => $user->id,
                'pet_id' => $pet->id,
                'type' => 'medication',
                'related_type' => 'medication',
                'related_id' => $med->id,
                'title' => 'Medication: '.$med->name,
                'body' => $pet->name.($med->dosage ? ' — '.$med->dosage : ''),
                'schedule_type' => 'recurring',
                'recurrence' => $recurrence,
                'time_of_day' => $time,
                'lead_time_days' => 0,
                'timezone' => $tz,
                'enabled' => true,
            ]);
            $reminder->next_fire_at = self::computeNextFireAt($reminder);
            $reminder->save();
        }
    }

    /** Owner + co-owners of a pet, unique by id. */
    public static function petRecipients(Pet $pet): Collection
    {
        $pet->loadMissing('owner', 'members');

        return collect([$pet->owner])
            ->filter()
            ->concat($pet->members)
            ->unique('id')
            ->values();
    }

    /**
     * Give a freshly-added co-owner their own copy of the pet's active
     * vaccination + medication reminders. Starts from a clean slate so a
     * re-accept can't duplicate.
     */
    public static function backfillForMember(Pet $pet, User $user): void
    {
        self::purgeForMember($pet, $user);

        $pet->loadMissing('vaccinations', 'medications');

        foreach ($pet->vaccinations as $vax) {
            if ($vax->status !== 'completed') {
                self::upsertVaccinationReminderFor($vax, $pet, $user);
            }
        }
        foreach ($pet->medications as $med) {
            self::createMedicationRemindersFor($med, $pet, $user);
        }
    }

    /** Remove a user's reminders for a pet (e.g. when they leave / are removed). */
    public static function purgeForMember(Pet $pet, User $user): void
    {
        Reminder::where('user_id', $user->id)->where('pet_id', $pet->id)->delete();
    }

    /** Remove the reminders tied to a medication. */
    public static function cancelMedicationReminder(Medication $med): void
    {
        Reminder::where('related_type', 'medication')->where('related_id', $med->id)->delete();
    }

    /**
     * Re-pin a user's enabled reminders to their (changed) timezone and recompute
     * fire times. Vaccination reminders re-derive their event time from the due
     * date; recurring reminders re-anchor their local time-of-day. Custom one-time
     * reminders keep their absolute instant (a calendar appointment doesn't move).
     */
    public static function recomputeForUser(User $user): void
    {
        $tz = $user->timezone ?: 'UTC';

        Reminder::where('user_id', $user->id)
            ->where('enabled', true)
            ->where('timezone', '!=', $tz)
            ->chunkById(200, function ($reminders) use ($tz) {
                foreach ($reminders as $r) {
                    $r->timezone = $tz;

                    if ($r->type === 'vaccination' && $r->related_type === 'vaccination' && $r->related_id) {
                        $vax = Vaccination::find($r->related_id);
                        if ($vax && $vax->due_date) {
                            $r->fire_at = self::eventFireAt(
                                $vax->due_date->format('Y-m-d'),
                                $r->time_of_day ?: '09:00',
                                $tz,
                            );
                        }
                    }

                    $r->next_fire_at = self::computeNextFireAt($r);
                    $r->save();
                }
            });
    }

    /** Absolute (UTC) instant for a local date + HH:MM in a timezone. */
    private static function eventFireAt(string $dueDateYmd, string $timeOfDay, string $tz): Carbon
    {
        [$h, $m] = array_pad(explode(':', $timeOfDay ?: '09:00'), 2, '0');

        return Carbon::parse($dueDateYmd, $tz)->setTime((int) $h, (int) $m, 0)->utc();
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
