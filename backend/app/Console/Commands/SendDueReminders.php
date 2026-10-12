<?php

namespace App\Console\Commands;

use App\Models\DeviceToken;
use App\Models\Reminder;
use App\Models\ReminderDelivery;
use App\Services\ExpoPushService;
use App\Services\ReminderScheduler;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;

class SendDueReminders extends Command
{
    protected $signature = 'reminders:send';

    protected $description = 'Record due pet-care reminder deliveries and push them as a backstop.';

    /** Push only kicks in once an occurrence is this far past due, so on-time local notifications win. */
    private const GRACE_MINUTES = 15;

    public function handle(ExpoPushService $push): int
    {
        $now = now();

        $due = Reminder::where('enabled', true)
            ->whereNotNull('next_fire_at')
            ->where('next_fire_at', '<=', $now)
            ->get();

        $delivered = 0;

        // Fetch every relevant device once, grouped by user (avoids 2 queries per reminder).
        $devicesByUser = DeviceToken::whereIn('user_id', $due->pluck('user_id')->unique())
            ->get()
            ->groupBy('user_id');

        foreach ($due as $reminder) {
            // One reminder can vanish mid-run (its vaccination was completed or its
            // medication changed): skip it so a missing row never aborts the
            // deliveries still due after it. Any other database error still fails
            // the run, so monitoring sees it.
            try {
                $occurrence = $reminder->next_fire_at->copy();

                // Idempotent: one delivery row per (reminder, occurrence).
                $delivery = ReminderDelivery::firstOrCreate(
                    ['reminder_id' => $reminder->id, 'occurrence_at' => $occurrence],
                    ['channel' => 'push', 'status' => 'pending'],
                );

                if ($delivery->status !== 'sent') {
                    $devices = $devicesByUser->get($reminder->user_id, collect());

                    // Backstop dedup: push only when overdue past the grace window, or when the
                    // user has no device that handles its own local notifications.
                    $hasLocalDevice = $devices->where('prefers_local', true)->isNotEmpty();
                    $pastGrace = $occurrence->lt($now->copy()->subMinutes(self::GRACE_MINUTES));

                    if ($pastGrace || ! $hasLocalDevice) {
                        $tokens = $devices->pluck('token');
                        $push->send($tokens->map(fn ($t) => [
                            'to' => $t,
                            'title' => $reminder->title,
                            'body' => $reminder->body ?? '',
                            'sound' => 'default',
                            'channelId' => 'reminders',
                            'data' => [
                                'reminderId' => $reminder->id,
                                'petId' => $reminder->pet_id,
                                'screen' => 'Notifications',
                            ],
                        ])->all());
                        $delivery->channel = 'push';
                    } else {
                        $delivery->channel = 'local';
                    }

                    $delivery->status = 'sent';
                    $delivery->sent_at = $now;
                    $delivery->save();
                    $delivered++;
                }

                // Roll the schedule forward.
                $reminder->last_fired_at = $now;
                if ($reminder->schedule_type === 'one_time') {
                    $reminder->enabled = false;
                    $reminder->next_fire_at = null;
                } else {
                    $reminder->next_fire_at = ReminderScheduler::computeNextFireAt($reminder);
                }
                $reminder->save();
            } catch (QueryException $e) {
                if (Reminder::whereKey($reminder->id)->exists()) {
                    throw $e;
                }
            }
        }

        $this->info("Processed {$due->count()} due reminder(s); delivered {$delivered}.");

        return self::SUCCESS;
    }
}
