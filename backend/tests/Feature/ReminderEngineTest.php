<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\Reminder;
use App\Models\ReminderDelivery;
use App\Models\User;
use App\Models\Vaccination;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReminderEngineTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function actingUser(array $attrs = []): array
    {
        $user = User::create(array_merge([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ], $attrs));

        return [$user, JwtService::createAccessToken($user->id)];
    }

    public function test_device_registration_sets_user_timezone(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->postJson('/devices', [
            'token' => 'ExponentPushToken[abc]',
            'platform' => 'ios',
            'timezone' => 'America/New_York',
        ])->assertOk();

        $this->assertSame('America/New_York', $user->fresh()->timezone);
    }

    public function test_invalid_timezone_is_ignored(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->postJson('/devices', [
            'token' => 'ExponentPushToken[abc]',
            'timezone' => 'Not/AZone',
        ])->assertOk();

        $this->assertSame('UTC', $user->fresh()->timezone);
    }

    public function test_adding_vaccination_creates_reminder_with_correct_tz(): void
    {
        [$user, $token] = $this->actingUser(['timezone' => 'America/New_York']);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);

        $this->withToken($token)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies',
            'due_date' => '2099-07-01',
        ])->assertCreated();

        $reminder = Reminder::where('user_id', $user->id)->where('type', 'vaccination')->first();
        $this->assertNotNull($reminder);
        $this->assertSame('America/New_York', $reminder->timezone);
        // 09:00 EDT (UTC-4) on 2099-07-01 = 13:00 UTC, minus 7 days lead.
        $this->assertSame('2099-06-24 13:00:00', $reminder->next_fire_at->format('Y-m-d H:i:s'));
    }

    public function test_completing_vaccination_cancels_reminder(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);
        $vaxId = $this->withToken($token)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2099-07-01',
        ])->json('id');

        $this->assertSame(1, Reminder::where('related_id', $vaxId)->count());

        $this->withToken($token)->patchJson("/pets/{$pet->id}/vaccinations/{$vaxId}/complete", [])->assertOk();

        // Gone, not just disabled: nothing left in /reminders to switch back on.
        $this->assertSame(0, Reminder::where('related_id', $vaxId)->count());
        $this->assertSame([], $this->withToken($token)->getJson('/reminders')->assertOk()->json());
    }

    public function test_deleting_vaccination_removes_its_reminder(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);
        $vaxId = $this->withToken($token)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2099-07-01',
        ])->json('id');

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/vaccinations/{$vaxId}")->assertNoContent();

        $this->assertSame(0, Reminder::where('related_id', $vaxId)->count());
    }

    public function test_reminder_crud_is_owner_scoped(): void
    {
        [, $ownerToken] = $this->actingUser();
        [, $otherToken] = $this->actingUser();

        $id = $this->withToken($ownerToken)->postJson('/reminders', [
            'title' => 'Mine',
            'schedule_type' => 'recurring',
            'recurrence' => 'daily',
            'time_of_day' => '08:00',
        ])->assertCreated()->json('id');

        $this->withToken($otherToken)->patchJson("/reminders/{$id}", ['enabled' => false])->assertNotFound();
        $this->withToken($otherToken)->deleteJson("/reminders/{$id}")->assertNotFound();
        $this->withToken($ownerToken)->deleteJson("/reminders/{$id}")->assertNoContent();
    }

    public function test_custom_reminder_rejects_past_fire_at(): void
    {
        [, $token] = $this->actingUser();

        $this->withToken($token)->postJson('/reminders', [
            'title' => 'Past',
            'schedule_type' => 'one_time',
            'fire_at' => '2000-01-01T00:00:00Z',
        ])->assertStatus(422);
    }

    public function test_send_due_reminders_records_one_delivery_and_is_idempotent(): void
    {
        [$user] = $this->actingUser();

        $reminder = Reminder::create([
            'user_id' => $user->id,
            'type' => 'custom',
            'title' => 'Due now',
            'schedule_type' => 'one_time',
            'fire_at' => now()->subDay(),
            'lead_time_days' => 0,
            'timezone' => 'UTC',
            'enabled' => true,
            'next_fire_at' => now()->subDay(),
        ]);

        $this->artisan('reminders:send')->assertExitCode(0);
        $this->assertSame(1, ReminderDelivery::where('reminder_id', $reminder->id)->count());
        $this->assertFalse((bool) $reminder->fresh()->enabled); // one-time disabled after firing

        // Re-running must not create a second delivery or re-fire.
        $this->artisan('reminders:send')->assertExitCode(0);
        $this->assertSame(1, ReminderDelivery::where('reminder_id', $reminder->id)->count());
    }

    public function test_timezone_change_recomputes_vaccination_reminder(): void
    {
        [$user, $token] = $this->actingUser(['timezone' => 'UTC']);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);
        $vaxId = $this->withToken($token)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2099-07-01',
        ])->json('id');

        $before = Reminder::where('related_id', $vaxId)->first();
        $this->assertSame('2099-06-24 09:00:00', $before->next_fire_at->format('Y-m-d H:i:s')); // 09:00 UTC − 7d

        $this->withToken($token)->patchJson('/users/me', ['timezone' => 'America/New_York'])->assertOk();

        $after = Reminder::where('related_id', $vaxId)->first();
        $this->assertSame('America/New_York', $after->timezone);
        $this->assertSame('2099-06-24 13:00:00', $after->next_fire_at->format('Y-m-d H:i:s')); // re-pinned to EDT
    }

    public function test_auth_endpoints_are_throttled(): void
    {
        $this->postJson('/auth/signup', [
            'name' => 'A', 'email' => 'a@example.com', 'password' => 'secret123',
        ])->assertCreated();

        $status = 200;
        for ($i = 0; $i < 25; $i++) {
            $status = $this->postJson('/auth/login', ['email' => 'a@example.com', 'password' => 'wrong'])->status();
        }

        $this->assertSame(429, $status);
    }

    public function test_cleanup_migration_removes_only_cancelled_vaccination_reminders(): void
    {
        [$user] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);
        $done = Vaccination::create(['pet_id' => $pet->id, 'name' => 'Rabies', 'due_date' => '2099-07-01', 'status' => 'completed']);
        $open = Vaccination::create(['pet_id' => $pet->id, 'name' => 'Lepto', 'due_date' => '2099-07-01']);
        $reminder = fn (string $relatedId, bool $enabled) => Reminder::create([
            'user_id' => $user->id, 'pet_id' => $pet->id, 'type' => 'vaccination',
            'related_type' => 'vaccination', 'related_id' => $relatedId, 'title' => 'Vaccination due',
            'schedule_type' => 'one_time', 'fire_at' => '2099-07-01 09:00:00', 'enabled' => $enabled,
        ])->id;

        $cancelledDone = $reminder($done->id, false);
        $cancelledGone = $reminder('00000000-0000-0000-0000-000000000000', false);
        $nextDue = $reminder($done->id, true);   // document intake: completed record, next dose
        $switchedOff = $reminder($open->id, false); // the user turned off an open one

        (require database_path('migrations/2026_10_13_000001_remove_cancelled_vaccination_reminders.php'))->up();

        $left = Reminder::pluck('id')->all();
        $this->assertNotContains($cancelledDone, $left);
        $this->assertNotContains($cancelledGone, $left);
        $this->assertContains($nextDue, $left);
        $this->assertContains($switchedOff, $left);
    }
}
