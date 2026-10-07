<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\JwtSecretGuard;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Outside local/testing, a publicly known signing key must make the API fail
 * closed: it can neither mint tokens nor accept ones forged with that key —
 * and it must say so, without side effects and without flooding the log.
 *
 * (The environment is switched after boot, which is enough here: the guard
 * reads app()->environment() at request time.)
 */
class JwtSecretGuardTest extends TestCase
{
    use RefreshDatabase;

    private function runAs(string $environment, string $secret): void
    {
        $this->app['env'] = $environment;
        config(['jwt.secret' => $secret]);
    }

    private function makeUser(): User
    {
        return User::create([
            'name' => 'U',
            'email' => 'u@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
    }

    public function test_a_token_forged_with_the_placeholder_is_rejected(): void
    {
        $user = $this->makeUser();
        $forged = JWT::encode([
            'sub' => $user->id, 'type' => 'access', 'ver' => 0,
            'iat' => now()->timestamp, 'exp' => now()->addHour()->timestamp,
        ], JwtSecretGuard::EXAMPLE_PLACEHOLDER, 'HS256');

        $this->runAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $this->withToken($forged)->getJson('/users/me')->assertStatus(401);
    }

    public function test_login_is_refused_with_a_503_and_no_token(): void
    {
        $this->makeUser();
        $this->runAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $res = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])
            ->assertStatus(503);
        $this->assertArrayNotHasKey('access_token', $res->json() ?? []);
    }

    public function test_signup_has_no_side_effect_when_refused(): void
    {
        $this->runAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $this->postJson('/auth/signup', ['name' => 'N', 'email' => 'new@example.com', 'password' => 'secret123'])
            ->assertStatus(503);
        $this->assertFalse(User::where('email', 'new@example.com')->exists());
    }

    public function test_staging_and_other_non_local_environments_are_covered(): void
    {
        $this->makeUser();
        $this->runAs('staging', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])->assertStatus(503);
    }

    public function test_health_reports_degraded_so_the_deploy_check_fails(): void
    {
        $this->runAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        $this->getJson('/health')->assertStatus(503)->assertJson(['status' => 'degraded']);

        $this->runAs('production', base64_encode(random_bytes(36)));
        $this->getJson('/health')->assertOk()->assertJson(['status' => 'ok']);
    }

    public function test_the_cause_is_logged_once_not_per_request(): void
    {
        Log::shouldReceive('log')->once()->withArgs(fn ($level, $msg) => $level === 'critical' && str_contains($msg, 'placeholder'));
        $this->runAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        for ($i = 0; $i < 3; $i++) {
            $this->withToken('anything')->getJson('/users/me')->assertStatus(401);
        }
    }

    public function test_a_strong_key_works(): void
    {
        $this->makeUser();
        $this->runAs('production', base64_encode(random_bytes(36)));

        $token = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])
            ->assertOk()->json('access_token');
        $this->withToken($token)->getJson('/users/me')->assertOk();
    }
}
