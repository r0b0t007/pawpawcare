<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Pet;
use App\Models\User;
use App\Models\Vaccination;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * CHW-245: per-pet bounds on the records that become reminders for everyone
 * sharing the pet, so a co-owner can't grow the owner's /reminders without
 * limit. Stopped medications don't count; switching one back on does.
 */
class PetRecordLimitsTest extends TestCase
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

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Rex', 'weight_unit' => 'kg']);
    }

    private function medications(Pet $pet, int $n, bool $active = true): void
    {
        for ($i = 1; $i <= $n; $i++) {
            Medication::create(['pet_id' => $pet->id, 'name' => "Med {$i}", 'times' => ['09:00'], 'active' => $active]);
        }
    }

    public function test_a_pet_takes_up_to_thirty_active_medications(): void
    {
        [$user, $token] = $this->actingUser('fr');
        $pet = $this->pet($user);
        $this->medications($pet, Medication::MAX_ACTIVE_PER_PET - 1);
        $this->medications($pet, 5, active: false); // stopped ones don't count
        $add = fn (array $extra = []) => $this->withToken($token)->postJson("/pets/{$pet->id}/medications", ['name' => 'New', 'frequency' => 'daily', 'times' => ['08:00'], ...$extra]);

        $add()->assertCreated(); // the 30th
        $add()->assertStatus(422)->assertExactJson([
            'detail' => 'Cet animal a déjà 30 médicaments avec rappels. Arrêtez-en ou supprimez-en un pour en ajouter un autre.',
            'code' => 'pet_limit_reached', // the app shows `detail` instead of its generic toast
        ]);
        // Stopped and "as needed" ones can still be recorded: they make no reminders.
        $add(['active' => false])->assertCreated();
        $add(['frequency' => 'as_needed'])->assertCreated();

        $this->assertSame(Medication::MAX_ACTIVE_PER_PET, Medication::withRemindersCount($pet->id));
    }

    public function test_as_needed_medications_do_not_count_until_they_get_a_schedule(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = $this->pet($user);
        for ($i = 1; $i <= 5; $i++) {
            Medication::create(['pet_id' => $pet->id, 'name' => "If needed {$i}", 'frequency' => 'as_needed', 'times' => ['09:00']]);
        }
        $this->medications($pet, Medication::MAX_ACTIVE_PER_PET - 1);
        $asNeeded = Medication::where('pet_id', $pet->id)->where('frequency', 'as_needed')->first();

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", ['name' => 'Daily', 'frequency' => 'daily'])->assertCreated();
        // At the limit, giving an "as needed" one a schedule would add reminders.
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$asNeeded->id}", ['frequency' => 'daily'])->assertStatus(422);
        $this->assertSame('as_needed', $asNeeded->fresh()->frequency);
    }

    public function test_switching_a_stopped_medication_back_on_counts_towards_the_limit(): void
    {
        [$user, $token] = $this->actingUser();
        $pet = $this->pet($user);
        $this->medications($pet, Medication::MAX_ACTIVE_PER_PET);
        $stopped = Medication::create(['pet_id' => $pet->id, 'name' => 'Old', 'times' => ['09:00'], 'active' => false]);
        $active = Medication::where('pet_id', $pet->id)->where('active', true)->first();

        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$stopped->id}", ['active' => true])->assertStatus(422);
        $this->assertFalse($stopped->fresh()->active);

        // Other edits at the limit still work, on stopped and active ones alike.
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$stopped->id}", ['notes' => 'Ended'])->assertOk();
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$active->id}", ['dosage' => '2 mg', 'active' => true])->assertOk();

        // Stopping one makes room again.
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$active->id}", ['active' => false])->assertOk();
        $this->withToken($token)->patchJson("/pets/{$pet->id}/medications/{$stopped->id}", ['active' => true])->assertOk();
    }

    public function test_a_pet_takes_up_to_two_hundred_vaccinations(): void
    {
        [$user, $token] = $this->actingUser('es');
        $pet = $this->pet($user);
        for ($i = 1; $i < Vaccination::MAX_PER_PET; $i++) {
            Vaccination::create(['pet_id' => $pet->id, 'name' => "Booster {$i}", 'due_date' => '2020-01-01', 'status' => 'completed']);
        }
        $add = fn () => $this->withToken($token)->postJson("/pets/{$pet->id}/vaccinations", ['name' => 'Rabies', 'due_date' => now()->addMonth()->toDateString()]);

        $add()->assertCreated(); // the 200th
        $add()->assertStatus(422)->assertExactJson(['detail' => 'Esta mascota ya tiene 200 vacunas. Elimine una para añadir otra.', 'code' => 'pet_limit_reached']);
        $this->assertSame(Vaccination::MAX_PER_PET, Vaccination::where('pet_id', $pet->id)->count());
    }

    public function test_a_co_owner_hits_the_same_limit(): void
    {
        [$owner] = $this->actingUser();
        [$coOwner, $token] = $this->actingUser();
        $pet = $this->pet($owner);
        $pet->members()->attach($coOwner->id, ['role' => 'member', 'created_at' => now()]);
        $this->medications($pet, Medication::MAX_ACTIVE_PER_PET);

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications", ['name' => 'More', 'frequency' => 'daily'])->assertStatus(422);
    }
}
