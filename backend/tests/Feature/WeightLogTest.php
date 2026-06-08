<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\User;
use App\Models\WeightLog;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WeightLogTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string, 2: Pet} */
    private function userWithPet(): array
    {
        $user = User::create([
            'name' => 'Owner',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'weight_unit' => 'kg']);

        return [$user, JwtService::createAccessToken($user->id), $pet];
    }

    public function test_adding_a_weight_logs_it_and_syncs_current_weight(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $log = $this->withToken($token)->postJson("/pets/{$pet->id}/weights", [
            'weight' => 23.4,
            'logged_at' => '2026-06-01',
        ])->assertCreated()->json();

        $this->assertSame('kg', $log['unit']); // defaulted from the pet
        $this->assertEqualsWithDelta(23.4, $pet->fresh()->weight, 0.001);
    }

    public function test_list_is_chronological(): void
    {
        [, $token, $pet] = $this->userWithPet();
        foreach (['2026-03-01' => 20, '2026-01-01' => 18, '2026-02-01' => 19] as $date => $w) {
            $this->withToken($token)->postJson("/pets/{$pet->id}/weights", ['weight' => $w, 'logged_at' => $date]);
        }

        $list = $this->withToken($token)->getJson("/pets/{$pet->id}/weights")->json();

        $this->assertSame(['2026-01-01', '2026-02-01', '2026-03-01'], array_column($list, 'logged_at'));
        // Current weight tracks the most recent date (Mar), not insertion order.
        $this->assertEqualsWithDelta(20.0, $pet->fresh()->weight, 0.001);
    }

    public function test_deleting_resyncs_current_weight_to_remaining_latest(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $jan = $this->withToken($token)->postJson("/pets/{$pet->id}/weights", ['weight' => 18, 'logged_at' => '2026-01-01'])->json('id');
        $this->withToken($token)->postJson("/pets/{$pet->id}/weights", ['weight' => 20, 'logged_at' => '2026-03-01']);
        $marId = WeightLog::where('pet_id', $pet->id)->orderByDesc('logged_at')->first()->id;

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/weights/{$marId}")->assertNoContent();

        $this->assertEqualsWithDelta(18.0, $pet->fresh()->weight, 0.001); // back to the Jan entry
        $this->assertNotNull($jan);
    }

    public function test_weights_are_owner_scoped(): void
    {
        [, , $pet] = $this->userWithPet();
        [, $otherToken] = $this->userWithPet();

        $this->withToken($otherToken)->getJson("/pets/{$pet->id}/weights")->assertNotFound();
        $this->withToken($otherToken)->postJson("/pets/{$pet->id}/weights", ['weight' => 10])->assertNotFound();
    }
}
