<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserAnalyticsOptOutTest extends TestCase
{
    use RefreshDatabase;

    private function actingUser(): array
    {
        $user = User::create([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    public function test_defaults_to_sharing_and_is_exposed_on_users_me(): void
    {
        [, $token] = $this->actingUser();

        $this->withToken($token)->getJson('/users/me')
            ->assertOk()->assertJsonPath('analytics_opt_out', false);
    }

    public function test_owner_can_opt_out_and_back_in(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->patchJson('/users/me', ['analytics_opt_out' => true])
            ->assertOk()->assertJsonPath('analytics_opt_out', true);
        $this->assertTrue($user->fresh()->analytics_opt_out);

        $this->withToken($token)->patchJson('/users/me', ['analytics_opt_out' => false])
            ->assertOk()->assertJsonPath('analytics_opt_out', false);
        $this->assertFalse($user->fresh()->analytics_opt_out);
    }

    public function test_rejects_non_boolean_values(): void
    {
        [$user, $token] = $this->actingUser();

        $this->withToken($token)->patchJson('/users/me', ['analytics_opt_out' => 'sometimes'])
            ->assertStatus(422);
        $this->assertFalse($user->fresh()->analytics_opt_out);
    }

    public function test_unrelated_updates_leave_it_unchanged(): void
    {
        [$user, $token] = $this->actingUser();
        $user->forceFill(['analytics_opt_out' => true])->save();

        $this->withToken($token)->patchJson('/users/me', ['bio' => 'Cat person'])->assertOk();

        $this->assertTrue($user->fresh()->analytics_opt_out);
    }

    public function test_is_not_mass_assignable(): void
    {
        $user = new User(['name' => 'X', 'analytics_opt_out' => true]);

        $this->assertNull($user->analytics_opt_out);
    }

    public function test_requires_authentication(): void
    {
        $this->patchJson('/users/me', ['analytics_opt_out' => true])->assertStatus(401);
    }
}
