<?php

namespace Tests\Feature;

use App\Http\Controllers\ReminderController;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\User;
use App\Services\JwtService;
use App\Services\ReminderScheduler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * CHW-243: bounds on what one request can add to someone's reminder list.
 * Each dose time is a recurring reminder for everyone sharing the pet, and
 * /reminders serializes every row, so both counts are capped.
 */
class ReminderLimitsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function actingUser(string $locale = 'en'): array
    {
        $user = User::create([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $user->forceFill(['locale' => $locale])->save();

        return [$user, JwtService::createAccessToken($user->id)];
    }

    /** @return list<string> "HH:00" for the first $n hours of the day */
    private function times(int $n): array
    {
        return array_map(fn ($h) => sprintf('%02d:00', $h), range(0, $n - 1));
    }

    public function test_a_medication_takes_up_to_twelve_distinct_dose_times(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex', 'weight_unit' => 'kg']);

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Pill', 'frequency' => 'daily', 'times' => $this->times(Medication::MAX_DOSE_TIMES),
        ])->assertCreated();
        $this->assertSame(Medication::MAX_DOSE_TIMES, Reminder::where('user_id', $user->id)->count());

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Too many', 'frequency' => 'daily', 'times' => $this->times(Medication::MAX_DOSE_TIMES + 1),
        ])->assertStatus(422);
        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Twice', 'frequency' => 'daily', 'times' => ['08:00', '08:00'],
        ])->assertStatus(422);

        $this->assertSame(1, Medication::where('pet_id', $pet->id)->count());
        $this->assertSame(Medication::MAX_DOSE_TIMES, Reminder::where('user_id', $user->id)->count());
    }

    public function test_editing_a_medication_has_the_same_limit_and_keeps_its_reminders(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex', 'weight_unit' => 'kg']);
        $id = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Pill', 'frequency' => 'daily', 'times' => ['08:00', '20:00'],
        ])->assertCreated()->json('id');

        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$id}", [
            'times' => $this->times(Medication::MAX_DOSE_TIMES + 1),
        ])->assertStatus(422);

        $this->assertSame(['08:00', '20:00'], Medication::find($id)->times);
        $this->assertSame(2, Reminder::where('user_id', $user->id)->count());
    }

    public function test_a_medication_saved_before_the_limit_gets_one_reminder_per_distinct_time_up_to_the_cap(): void
    {
        [$user] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex', 'weight_unit' => 'kg']);
        // As an older row could be: 15 times, two of them repeated.
        $times = [...$this->times(15), '00:00', '01:00'];
        $med = Medication::create(['pet_id' => $pet->id, 'name' => 'Old', 'frequency' => 'daily', 'times' => $times]);

        ReminderScheduler::syncMedicationReminder($med);

        $reminders = Reminder::where('related_id', $med->id)->pluck('time_of_day')->all();
        $this->assertCount(Medication::MAX_DOSE_TIMES, $reminders);
        $this->assertSame($reminders, array_values(array_unique($reminders)));
    }

    public function test_the_dose_time_limit_is_explained_in_the_users_language(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Pill', 'frequency' => 'daily', 'times' => $this->times(13),
        ])->assertStatus(422)->assertExactJson(['detail' => 'Le champ horaires ne doit pas contenir plus de 12 éléments.']);
    }

    public function test_custom_reminders_stop_at_the_cap_and_say_why(): void
    {
        [$user, $token] = $this->actingUser('es');
        for ($i = 1; $i < ReminderController::MAX_CUSTOM_REMINDERS; $i++) {
            Reminder::create([
                'user_id' => $user->id, 'type' => 'custom', 'title' => "R{$i}", 'schedule_type' => 'recurring',
                'recurrence' => 'daily', 'time_of_day' => '09:00', 'timezone' => 'UTC', 'enabled' => $i % 2 === 0,
            ]);
        }
        $new = fn () => $this->withToken($token)->postJson('/reminders', [
            'title' => 'One more', 'schedule_type' => 'recurring', 'recurrence' => 'daily', 'time_of_day' => '10:00',
        ]);

        $new()->assertCreated(); // the 200th; switched-off ones count too
        $new()->assertStatus(422)->assertExactJson([
            'detail' => 'Puede tener hasta 200 recordatorios. Elimine uno para añadir otro.',
        ]);
        $this->assertSame(ReminderController::MAX_CUSTOM_REMINDERS, Reminder::where('user_id', $user->id)->count());

        // Deleting one makes room again.
        $this->withToken($token)->deleteJson('/reminders/'.Reminder::where('user_id', $user->id)->value('id'))->assertNoContent();
        $new()->assertCreated();
    }

    public function test_medication_and_vaccination_reminders_do_not_count_towards_the_cap(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex', 'weight_unit' => 'kg']);
        for ($i = 0; $i < ReminderController::MAX_CUSTOM_REMINDERS; $i++) {
            Reminder::create([
                'user_id' => $user->id, 'pet_id' => $pet->id, 'type' => 'medication', 'title' => 'Dose',
                'schedule_type' => 'recurring', 'recurrence' => 'daily', 'time_of_day' => '09:00', 'timezone' => 'UTC', 'enabled' => true,
            ]);
        }

        $this->withToken($token)->postJson('/reminders', [
            'title' => 'Mine', 'schedule_type' => 'recurring', 'recurrence' => 'daily',
        ])->assertCreated();
    }
}
