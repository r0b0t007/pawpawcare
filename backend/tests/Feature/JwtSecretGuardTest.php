<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\JwtSecretGuard;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * In production, a publicly known signing key must make the API fail closed:
 * it can neither mint tokens nor accept ones forged with that key.
 */
class JwtSecretGuardTest extends TestCase
{
    use RefreshDatabase;

    private function runInProductionWithKey(string $secret): void
    {
        $this->app['env'] = 'production';
        config(['jwt.secret' => $secret]);
    }

    public function test_a_token_forged_with_the_placeholder_is_rejected_in_production(): void
    {
        $user = User::create(['name' => 'U', 'email' => 'u@example.com', 'timezone' => 'UTC']);
        $forged = JWT::encode([
            'sub' => $user->id, 'type' => 'access', 'ver' => 0,
            'iat' => now()->timestamp, 'exp' => now()->addHour()->timestamp,
        ], JwtSecretGuard::EXAMPLE_PLACEHOLDER, 'HS256');

        $this->runInProductionWithKey(JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $this->withToken($forged)->getJson('/users/me')->assertStatus(401);
    }

    public function test_no_token_is_issued_in_production_with_the_placeholder(): void
    {
        User::create([
            'name' => 'U',
            'email' => 'u@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $this->runInProductionWithKey(JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $res = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123']);

        $res->assertStatus(500);
        $this->assertArrayNotHasKey('access_token', $res->json() ?? []);
    }

    public function test_production_with_a_strong_key_works(): void
    {
        User::create([
            'name' => 'U',
            'email' => 'u@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $this->runInProductionWithKey(base64_encode(random_bytes(36)));

        $token = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])
            ->assertOk()->json('access_token');
        $this->withToken($token)->getJson('/users/me')->assertOk();
    }
}
