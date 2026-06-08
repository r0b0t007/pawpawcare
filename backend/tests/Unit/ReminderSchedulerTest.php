<?php

namespace Tests\Unit;

use App\Models\Reminder;
use App\Services\ReminderScheduler;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ReminderSchedulerTest extends TestCase
{
    public function test_one_time_subtracts_lead_time(): void
    {
        $r = new Reminder([
            'schedule_type' => 'one_time',
            'fire_at' => Carbon::parse('2099-07-01 13:00:00', 'UTC'),
            'lead_time_days' => 7,
            'enabled' => true,
        ]);

        $next = ReminderScheduler::computeNextFireAt($r);

        $this->assertSame('2099-06-24 13:00:00', $next->format('Y-m-d H:i:s'));
    }

    public function test_one_time_already_fired_returns_null(): void
    {
        $r = new Reminder([
            'schedule_type' => 'one_time',
            'fire_at' => Carbon::parse('2099-07-01 13:00:00', 'UTC'),
            'lead_time_days' => 0,
            'last_fired_at' => Carbon::parse('2099-07-01 13:00:00', 'UTC'),
            'enabled' => true,
        ]);

        $this->assertNull(ReminderScheduler::computeNextFireAt($r));
    }

    public function test_disabled_returns_null(): void
    {
        $r = new Reminder([
            'schedule_type' => 'one_time',
            'fire_at' => Carbon::parse('2099-01-01 00:00:00', 'UTC'),
            'enabled' => false,
        ]);

        $this->assertNull(ReminderScheduler::computeNextFireAt($r));
    }

    public function test_recurring_daily_is_future_and_anchored_to_local_time(): void
    {
        $r = new Reminder([
            'schedule_type' => 'recurring',
            'recurrence' => 'daily',
            'time_of_day' => '09:00',
            'timezone' => 'America/New_York',
            'enabled' => true,
        ]);

        $next = ReminderScheduler::computeNextFireAt($r);

        $this->assertNotNull($next);
        $this->assertTrue($next->isFuture());
        // Stored as UTC, but should be 09:00 in the reminder's local zone.
        $this->assertSame('09:00', $next->copy()->setTimezone('America/New_York')->format('H:i'));
    }
}
