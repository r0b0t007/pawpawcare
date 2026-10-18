<?php

namespace Tests\Feature;

use App\Models\Reminder;
use App\Models\User;
use App\Services\JwtService;
use App\Services\ReminderScheduler;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * upcoming_fire_at: every occurrence of a reminder over the next week, which
 * the app schedules as local notifications so a daily dose keeps arriving
 * while the phone is offline (not just the next one).
 */
class ReminderUpcomingTest extends TestCase
{
    use RefreshDatabase;

    /** Travel in time; the JWT library checks expiry on its own clock, so move it too. */
    private function at(string $time, string $tz = 'UTC'): void
    {
        $this->travelTo(Carbon::parse($time, $tz));
        JWT::$timestamp = now()->timestamp;
    }

    protected function tearDown(): void
    {
        JWT::$timestamp = null;
        parent::tearDown();
    }

    /** @return array{0: User, 1: string} */
    private function actingUser(string $tz = 'UTC'): array
    {
        $user = User::create([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => $tz,
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function daily(string $token, string $time = '08:00'): array
    {
        return $this->withToken($token)->postJson('/reminders', [
            'title' => 'Pill',
            'schedule_type' => 'recurring',
            'recurrence' => 'daily',
            'time_of_day' => $time,
        ])->assertCreated()->json();
    }

    /** @return list<string> local "Y-m-d H:i" of each upcoming instant */
    private function local(array $times, string $tz): array
    {
        return array_map(fn ($t) => Carbon::parse($t)->setTimezone($tz)->format('Y-m-d H:i'), $times);
    }

    public function test_a_daily_reminder_lists_the_next_week_at_its_local_time(): void
    {
        $this->at('2026-10-18 10:00', 'Europe/Paris');
        [, $token] = $this->actingUser('Europe/Paris');

        $reminder = $this->daily($token);

        $this->assertSame($reminder['next_fire_at'], $reminder['upcoming_fire_at'][0]);
        $this->assertSame([
            '2026-10-19 08:00', '2026-10-20 08:00', '2026-10-21 08:00', '2026-10-22 08:00',
            '2026-10-23 08:00', '2026-10-24 08:00', '2026-10-25 08:00',
        ], $this->local($reminder['upcoming_fire_at'], 'Europe/Paris'));
    }

    public function test_the_local_time_holds_across_a_daylight_saving_change(): void
    {
        // Paris leaves summer time on 2026-10-25: 08:00 moves from 06:00 to 07:00 UTC.
        $this->at('2026-10-18 10:00', 'Europe/Paris');
        [, $token] = $this->actingUser('Europe/Paris');

        $utc = array_map(fn ($t) => Carbon::parse($t)->utc()->format('m-d H:i'), $this->daily($token)['upcoming_fire_at']);

        $this->assertSame('10-24 06:00', $utc[5]);
        $this->assertSame('10-25 07:00', $utc[6]);
    }

    public function test_the_list_is_what_the_server_will_fire_one_after_another(): void
    {
        $this->at('2026-10-18 10:00', 'UTC');
        [, $token] = $this->actingUser();
        $upcoming = $this->daily($token, '21:30')['upcoming_fire_at'];

        // Let the minute-by-minute job fire each one; next_fire_at must walk the same list.
        foreach (array_slice($upcoming, 0, 3) as $i => $expected) {
            $reminder = Reminder::first();
            $this->assertSame($expected, $reminder->next_fire_at->toISOString(), "occurrence {$i}");
            $this->at(Carbon::parse($expected)->addSeconds(20)->toDateTimeString());
            Artisan::call('reminders:send');
        }
    }

    public function test_after_a_snooze_the_list_starts_at_the_snooze_then_follows_the_usual_time(): void
    {
        $this->at('2026-10-18 10:00', 'UTC');
        [$user, $token] = $this->actingUser();
        $this->daily($token);

        $reminder = Reminder::where('user_id', $user->id)->first();
        $reminder->next_fire_at = Carbon::parse('2026-10-18 10:45', 'UTC'); // what a snooze sets
        $reminder->save();

        $local = $this->local(ReminderScheduler::upcomingFireTimes($reminder->fresh()), 'UTC');
        $this->assertSame(['2026-10-18 10:45', '2026-10-19 08:00', '2026-10-20 08:00'], array_slice($local, 0, 3));
        // Today's 08:00 is already past and never listed.
        $this->assertNotContains('2026-10-18 08:00', $local);
    }

    public function test_one_time_disabled_and_spent_reminders(): void
    {
        $this->at('2026-10-18 10:00', 'UTC');
        [$user, $token] = $this->actingUser();

        $once = $this->withToken($token)->postJson('/reminders', [
            'title' => 'Vet',
            'schedule_type' => 'one_time',
            'fire_at' => '2026-10-30T09:00:00Z',
        ])->assertCreated()->json();
        $this->assertSame([$once['next_fire_at']], $once['upcoming_fire_at']);

        $daily = $this->daily($token);
        $off = $this->withToken($token)->patchJson("/reminders/{$daily['id']}", ['enabled' => false])->assertOk()->json();
        $this->assertSame([], $off['upcoming_fire_at']);

        $weekly = Reminder::forceCreate([
            'user_id' => $user->id, 'type' => 'custom', 'title' => 'Brush', 'schedule_type' => 'recurring',
            'recurrence' => 'weekly', 'time_of_day' => '09:00', 'timezone' => 'UTC', 'enabled' => true,
            'next_fire_at' => Carbon::parse('2026-10-19 09:00', 'UTC'),
        ]);
        // The next one is in the window, the one after it a week later is not.
        $this->assertCount(1, ReminderScheduler::upcomingFireTimes($weekly));
    }

    public function test_a_bad_stored_timezone_lists_only_the_next_one_instead_of_failing(): void
    {
        $this->at('2026-10-18 10:00', 'UTC');
        [$user, $token] = $this->actingUser();
        $this->daily($token);
        Reminder::where('user_id', $user->id)->update(['timezone' => 'Mars/Olympus_Mons']);

        $list = $this->withToken($token)->getJson('/reminders')->assertOk()->json();

        $this->assertCount(1, $list[0]['upcoming_fire_at']);
        $this->assertSame($list[0]['next_fire_at'], $list[0]['upcoming_fire_at'][0]);
    }

    public function test_the_list_has_a_cap_and_stays_in_the_window(): void
    {
        $this->at('2026-10-18 10:00', 'UTC');
        [$user, $token] = $this->actingUser();
        $this->daily($token, '10:01');
        $reminder = Reminder::where('user_id', $user->id)->first();

        $times = ReminderScheduler::upcomingFireTimes($reminder);

        $this->assertLessThanOrEqual(ReminderScheduler::LOCAL_MAX_OCCURRENCES, count($times));
        $this->assertTrue(end($times)->lessThanOrEqualTo(now()->addDays(ReminderScheduler::LOCAL_HORIZON_DAYS)));
        $this->assertSame($times, collect($times)->sort()->values()->all());
    }
}
