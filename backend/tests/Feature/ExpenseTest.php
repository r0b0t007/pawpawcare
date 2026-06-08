<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ExpenseTest extends TestCase
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
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna']);

        return [$user, JwtService::createAccessToken($user->id), $pet];
    }

    public function test_adding_and_listing_expenses(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $expense = $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", [
            'category' => 'vet',
            'amount' => 89.5,
            'incurred_on' => '2026-06-01',
            'notes' => 'Annual checkup',
        ])->assertCreated()->json();

        $this->assertSame('vet', $expense['category']);
        $this->assertSame(89.5, $expense['amount']);

        $list = $this->withToken($token)->getJson("/pets/{$pet->id}/expenses")->json();
        $this->assertCount(1, $list);
    }

    public function test_category_defaults_to_other_and_validates(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $e = $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", ['amount' => 10])
            ->assertCreated()->json();
        $this->assertSame('other', $e['category']);

        $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", [
            'amount' => 10, 'category' => 'spaceship',
        ])->assertStatus(422);
    }

    public function test_amount_is_required_and_future_dates_rejected(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", ['category' => 'food'])
            ->assertStatus(422);

        $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", [
            'amount' => 10, 'incurred_on' => now()->addWeek()->format('Y-m-d'),
        ])->assertStatus(422);
    }

    public function test_delete_and_owner_scoping(): void
    {
        [, $token, $pet] = $this->userWithPet();
        [, $otherToken] = $this->userWithPet();

        $id = $this->withToken($token)->postJson("/pets/{$pet->id}/expenses", ['amount' => 5])->json('id');

        $this->withToken($otherToken)->getJson("/pets/{$pet->id}/expenses")->assertNotFound();
        $this->withToken($otherToken)->deleteJson("/pets/{$pet->id}/expenses/{$id}")->assertNotFound();

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/expenses/{$id}")->assertNoContent();
        $this->assertSame(0, Expense::count());
    }
}
