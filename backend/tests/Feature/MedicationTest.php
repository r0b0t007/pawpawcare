<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MedicationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string, 2: Pet} */
    private function userWithPet(array $attrs = []): array
    {
        $user = User::create(array_merge([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ], $attrs));
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);

        return [$user, JwtService::createAccessToken($user->id), $pet];
    }

    private function medReminderCount(string $medId): int
    {
        return Reminder::where('type', 'medication')->where('related_id', $medId)->count();
    }

    public function test_creating_medication_creates_one_recurring_reminder_per_dose_time(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $med = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel',
            'dosage' => '5mg',
            'frequency' => 'daily',
            'times' => ['08:00', '20:00'],
        ])->assertCreated()->json();

        $this->assertSame(['08:00', '20:00'], $med['times']);
        $this->assertSame(2, $this->medReminderCount($med['id']));
        $this->assertSame('recurring', Reminder::where('related_id', $med['id'])->first()->schedule_type);
    }

    public function test_as_needed_medication_creates_no_reminder(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $med = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Pain relief',
            'frequency' => 'as_needed',
        ])->assertCreated()->json();

        $this->assertSame(0, $this->medReminderCount($med['id']));
    }

    public function test_update_resyncs_reminders(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $med = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00', '20:00'],
        ])->json();
        $this->assertSame(2, $this->medReminderCount($med['id']));

        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$med['id']}", [
            'times' => ['09:00'],
        ])->assertOk();

        $this->assertSame(1, $this->medReminderCount($med['id']));

        // Deactivating removes reminders.
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$med['id']}", [
            'active' => false,
        ])->assertOk();
        $this->assertSame(0, $this->medReminderCount($med['id']));
    }

    public function test_delete_cancels_reminders(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $med = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00'],
        ])->json();
        $this->assertSame(1, $this->medReminderCount($med['id']));

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/medications/{$med['id']}")->assertNoContent();

        $this->assertSame(0, $this->medReminderCount($med['id']));
        $this->assertNull(Medication::find($med['id']));
    }

    public function test_logging_a_dose_sets_last_administered(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $med = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00'],
        ])->json();

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications/{$med['id']}/log", [])
            ->assertCreated();

        $list = $this->withToken($token)->getJson("/pets/{$pet->id}/medications")->json();
        $this->assertNotNull($list[0]['last_administered_at']);
    }

    public function test_medications_are_owner_scoped(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $otherToken] = $this->userWithPet();

        $med = $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel', 'frequency' => 'daily', 'times' => ['08:00'],
        ])->json();

        // Another user can't even see this pet's medications.
        $this->withToken($otherToken)->getJson("/pets/{$pet->id}/medications")->assertNotFound();
        $this->withToken($otherToken)->deleteJson("/pets/{$pet->id}/medications/{$med['id']}")->assertNotFound();
    }
}
