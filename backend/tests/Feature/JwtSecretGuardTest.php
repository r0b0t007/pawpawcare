<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\JwtSecretGuard;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Outside local/testing, a publicly known (or borrowed) signing key must make
 * the API fail closed: it can neither mint tokens nor accept ones forged with
 * that key — and it must say so, without side effects and without flooding
 * the log.
 *
 * Each test boots a fresh application with the environment set *before*
 * boot, so production-only boot logic runs exactly as on the server.
 */
class JwtSecretGuardTest extends TestCase
{
    private const VARS = ['APP_ENV', 'SECRET_KEY', 'APP_KEY'];

    /** @var array<string, array{0: mixed, 1: mixed, 2: string|false}> */
    private array $saved = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (self::VARS as $k) {
            $this->saved[$k] = [$_ENV[$k] ?? null, $_SERVER[$k] ?? null, getenv($k)];
        }
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        foreach ($this->saved as $k => [$env, $server, $put]) {
            $this->setVar($k, $env ?? ($put === false ? null : $put));
            if ($server === null) {
                unset($_SERVER[$k]);
            }
        }
    }

    private function setVar(string $key, ?string $value): void
    {
        if ($value === null) {
            unset($_ENV[$key], $_SERVER[$key]);
            putenv($key);

            return;
        }
        $_ENV[$key] = $_SERVER[$key] = $value;
        putenv("{$key}={$value}");
    }

    /** Boot a fresh app as $environment with the given keys, plus a migrated DB. */
    private function bootAs(string $environment, string $secretKey, ?string $appKey = null): void
    {
        $this->setVar('APP_ENV', $environment);
        $this->setVar('SECRET_KEY', $secretKey);
        $this->setVar('APP_KEY', $appKey ?? 'base64:'.base64_encode(random_bytes(32)));
        $this->refreshApplication();
        $this->artisan('migrate', ['--force' => true]);
        $this->assertSame($environment, app()->environment());
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

    private function strongKey(): string
    {
        return base64_encode(random_bytes(36));
    }

    public function test_a_token_forged_with_the_placeholder_is_rejected(): void
    {
        $this->bootAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        $user = $this->makeUser();
        $forged = JWT::encode([
            'sub' => $user->id, 'type' => 'access', 'ver' => 0,
            'iat' => now()->timestamp, 'exp' => now()->addHour()->timestamp,
        ], JwtSecretGuard::EXAMPLE_PLACEHOLDER, 'HS256');

        $this->withToken($forged)->getJson('/users/me')->assertStatus(401);
    }

    public function test_login_is_refused_with_a_503_and_no_token(): void
    {
        $this->bootAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        $this->makeUser();

        $res = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])
            ->assertStatus(503);
        $this->assertArrayNotHasKey('access_token', $res->json() ?? []);
    }

    public function test_signup_has_no_side_effect_when_refused(): void
    {
        $this->bootAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);

        $this->postJson('/auth/signup', ['name' => 'N', 'email' => 'new@example.com', 'password' => 'secret123'])
            ->assertStatus(503);
        $this->assertFalse(User::where('email', 'new@example.com')->exists());
    }

    public function test_a_key_that_falls_back_to_app_key_is_refused(): void
    {
        // With SECRET_KEY unset, config/jwt.php resolves to APP_KEY — so the
        // signing key equals the app key actually in effect, set up here.
        // (Unsetting SECRET_KEY / overriding APP_KEY via env isn't reliable in
        // tests: Dotenv's process-wide repository re-applies values it loaded
        // from a .env, as CI has, on every later boot.)
        $this->bootAs('production', $this->strongKey());
        config(['jwt.secret' => config('app.key')]);
        $this->makeUser();

        $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])->assertStatus(503);
        $this->getJson('/health')->assertStatus(503);
    }

    public function test_staging_and_other_non_local_environments_are_covered(): void
    {
        $this->bootAs('staging', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        $this->makeUser();

        $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])->assertStatus(503);
    }

    public function test_health_reports_degraded_so_the_deploy_check_fails(): void
    {
        $this->bootAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        $this->getJson('/health')->assertStatus(503)->assertJson(['status' => 'degraded']);
    }

    public function test_health_is_ok_with_a_strong_key(): void
    {
        $this->bootAs('production', $this->strongKey());
        $this->getJson('/health')->assertOk()->assertJson(['status' => 'ok']);
    }

    public function test_the_cause_is_logged_once_not_per_request(): void
    {
        $this->bootAs('production', JwtSecretGuard::EXAMPLE_PLACEHOLDER);
        Log::shouldReceive('log')->once()->withArgs(fn ($level, $msg) => $level === 'critical' && str_contains($msg, 'placeholder'));

        for ($i = 0; $i < 3; $i++) {
            $this->withToken('anything')->getJson('/users/me')->assertStatus(401);
        }
    }

    public function test_a_strong_key_works_in_a_real_production_boot(): void
    {
        $this->bootAs('production', $this->strongKey());
        $this->makeUser();

        $token = $this->postJson('/auth/login', ['email' => 'u@example.com', 'password' => 'secret123'])
            ->assertOk()->json('access_token');
        $this->withToken($token)->getJson('/users/me')->assertOk();
    }
}
