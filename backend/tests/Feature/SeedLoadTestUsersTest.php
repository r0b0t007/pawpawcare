<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Guards `loadtest:seed-users`. It ships with the app, so it exists on the
 * production server too, and it creates accounts with a published password.
 */
class SeedLoadTestUsersTest extends TestCase
{
    use RefreshDatabase;

    private string $out;

    protected function setUp(): void
    {
        parent::setUp();
        $this->out = sys_get_temp_dir().'/loadtest-users-'.uniqid().'.json';
    }

    protected function tearDown(): void
    {
        putenv('LOADTEST_SEEDING');
        @unlink($this->out);
        parent::tearDown();
    }

    /** @return array<int, array{string}> */
    public static function refusedEnvironments(): array
    {
        return [['production'], ['staging'], ['prod']];
    }

    #[DataProvider('refusedEnvironments')]
    public function test_refuses_to_seed_outside_local_and_testing(string $env): void
    {
        $this->app['env'] = $env;

        $this->artisan('loadtest:seed-users', ['--count' => 2, '--out' => $this->out, '--force' => true])
            ->assertFailed();

        $this->assertSame(0, User::count());
        $this->assertFileDoesNotExist($this->out);
    }

    public function test_env_flag_cannot_bypass_the_configured_environment(): void
    {
        // `php artisan ... --env=local` on the production server: Laravel takes
        // the runtime environment from the flag, but config('app.env') still
        // comes from production's .env / cached config.
        $this->app['env'] = 'local';
        config(['app.env' => 'production']);
        putenv('LOADTEST_SEEDING=1');

        $this->artisan('loadtest:seed-users', ['--count' => 1, '--out' => $this->out, '--force' => true])
            ->assertFailed();
        $this->artisan('loadtest:seed-users', ['--purge' => true, '--force' => true])->assertFailed();

        $this->assertSame(0, User::count());
    }

    public function test_local_needs_the_docker_opt_in(): void
    {
        $this->app['env'] = 'local';
        config(['app.env' => 'local']);

        $this->artisan('loadtest:seed-users', ['--count' => 1, '--out' => $this->out, '--force' => true])
            ->assertFailed();
        $this->assertSame(0, User::count());

        putenv('LOADTEST_SEEDING=1');
        $this->artisan('loadtest:seed-users', ['--count' => 1, '--out' => $this->out, '--force' => true])
            ->assertSuccessful();
        $this->assertSame(1, User::count());
    }

    public function test_purge_asks_before_deleting(): void
    {
        $this->artisan('loadtest:seed-users', ['--count' => 1, '--out' => $this->out, '--force' => true])->assertSuccessful();

        $this->artisan('loadtest:seed-users', ['--purge' => true])
            ->expectsConfirmation('Delete every load-test user and their data?', 'no')
            ->assertFailed();

        $this->assertSame(1, User::count());
    }

    public function test_refuses_to_purge_outside_local_and_testing(): void
    {
        $this->artisan('loadtest:seed-users', ['--count' => 1, '--out' => $this->out, '--force' => true])->assertSuccessful();
        $this->app['env'] = 'production';

        $this->artisan('loadtest:seed-users', ['--purge' => true, '--force' => true])->assertFailed();

        $this->assertSame(1, User::count());
    }

    public function test_seeds_users_and_writes_working_tokens(): void
    {
        $this->artisan('loadtest:seed-users', [
            '--count' => 3, '--pets' => 1, '--vaccinations' => 2, '--out' => $this->out, '--force' => true,
        ])->assertSuccessful();

        $pool = json_decode(file_get_contents($this->out), true);
        $this->assertCount(3, $pool);

        // Each token authenticates as the user it was minted for.
        $payload = JwtService::decode($pool[0]['token']);
        $this->assertSame($pool[0]['id'], $payload['sub']);
        $this->withHeaders(['Authorization' => 'Bearer '.$pool[0]['token']])
            ->getJson('/users/me')
            ->assertOk()
            ->assertJsonPath('email', $pool[0]['email']);
    }

    public function test_purge_only_touches_load_test_accounts(): void
    {
        $real = User::create(['name' => 'Real', 'email' => 'real@example.com', 'hashed_password' => 'x']);
        $this->artisan('loadtest:seed-users', ['--count' => 2, '--out' => $this->out, '--force' => true])->assertSuccessful();

        $this->artisan('loadtest:seed-users', ['--purge' => true, '--force' => true])->assertSuccessful();

        $this->assertSame([$real->id], User::pluck('id')->all());
    }
}
