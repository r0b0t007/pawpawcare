<?php

namespace App\Console\Commands;

use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Builds the user pool a k6 load test runs as, and writes their pre-minted
 * access tokens to a JSON file for k6 to read.
 *
 * Why tokens are minted here instead of logged in from the test:
 *
 *  - `/auth/*` is `throttle:20,1` and, for unauthenticated requests, keyed by
 *    IP. A load generator is one IP, so a test that logs in per-VU is 429'd
 *    after 20 logins a minute no matter how many users exist.
 *  - `throttle:api` is `Limit::perMinute(120)` keyed by user id, so ONE user
 *    can only ever absorb 2 req/s. Offered load has to be spread across many
 *    distinct users or you are measuring the rate limiter, not the app.
 *
 * Pool sizing: at R requests/second spread evenly over N users, each user sees
 * 60R/N requests per minute, so keep N >= R/2. The default 200 users supports
 * ~400 req/s before `throttle:api` becomes the bottleneck.
 *
 * See docs/load-testing.md.
 */
class SeedLoadTestUsers extends Command
{
    /**
     * Every account this command creates carries this email prefix, so --fresh
     * can clean up precisely and can never touch a real user.
     */
    private const EMAIL_PREFIX = 'loadtest+';

    /** `.test` is reserved (RFC 6761), so these can never be real addresses. */
    private const EMAIL_DOMAIN = '@pawpawcare.test';

    private const PASSWORD = 'loadtest-password';

    private const ALLOWED_ENVIRONMENTS = ['local', 'testing'];

    protected $signature = 'loadtest:seed-users
                            {--count=200 : How many load-test users to create}
                            {--pets=2 : Pets per user}
                            {--vaccinations=8 : Open vaccinations per pet (GET /dashboard fetches all of them)}
                            {--out= : Where to write the k6 pool (default: ../loadtest/users.json)}
                            {--fresh : Delete existing load-test users (and their data) first}
                            {--purge : Delete all load-test users and exit without seeding}
                            {--force : Skip the confirmation prompt}';

    protected $description = 'Seed disposable users + pets for k6 load testing and write their access tokens to users.json.';

    public function handle(): int
    {
        $count = max(1, (int) $this->option('count'));
        $petsPer = max(0, (int) $this->option('pets'));
        $vaxPer = max(0, (int) $this->option('vaccinations'));
        $out = $this->option('out') ?: base_path('../loadtest/users.json');

        if ($this->option('purge')) {
            if (! $this->allowedEnvironment()) {
                return self::FAILURE;
            }

            if (! $this->option('force') && ! $this->confirm('Delete every load-test user and their data?', false)) {
                return self::FAILURE;
            }

            $this->line("Deleted {$this->purge()} load-test user(s). Nothing seeded (--purge).");

            return self::SUCCESS;
        }

        if (! $this->confirmTarget($count)) {
            return self::FAILURE;
        }

        if ($this->option('fresh')) {
            $this->line("Deleted {$this->purge()} existing load-test user(s).");
        }

        // bcrypt is deliberately slow; hashing once and reusing the digest turns
        // a ~20s seed into a sub-second one. Same password for every account.
        $digest = Hash::make(self::PASSWORD);

        $pool = [];
        $vaxRows = [];
        $now = now();

        $bar = $this->output->createProgressBar($count);
        $bar->start();

        for ($i = 0; $i < $count; $i++) {
            $user = User::create([
                'name' => "Load Test {$i}",
                'email' => self::EMAIL_PREFIX.$i.self::EMAIL_DOMAIN,
                'hashed_password' => $digest,
                'is_active' => true,
            ]);

            for ($p = 0; $p < $petsPer; $p++) {
                $pet = Pet::create([
                    'owner_id' => $user->id,
                    'name' => "Pet {$i}-{$p}",
                    'type' => $p % 2 === 0 ? 'dog' : 'cat',
                    'weight' => 8.0 + ($p * 1.5),
                    'birthday' => $now->clone()->subYears(3)->toDateString(),
                ]);

                for ($v = 0; $v < $vaxPer; $v++) {
                    $vaxRows[] = [
                        'id' => (string) Str::uuid(),
                        'pet_id' => $pet->id,
                        'name' => 'Vaccine '.$v,
                        // Spread the due dates evenly AROUND today, so the
                        // dashboard always gets a realistic mix of overdue and
                        // upcoming to classify whatever --vaccinations is set
                        // to. (A fixed offset made every date land in the past
                        // for small counts, so the run measured only the
                        // overdue branch.)
                        'due_date' => $now->clone()
                            ->addDays((int) round(($v - ($vaxPer - 1) / 2) * 9))
                            ->toDateString(),
                        'status' => 'upcoming',
                        'created_at' => $now,
                    ];
                }
            }

            $pool[] = [
                'id' => $user->id,
                'email' => $user->email,
                'token' => JwtService::createAccessToken($user->id),
            ];

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();

        foreach (array_chunk($vaxRows, 500) as $chunk) {
            DB::table('vaccinations')->insert($chunk);
        }

        $this->writePool($out, $pool);

        $ttl = (int) config('jwt.access_ttl');
        $this->newLine();
        $this->info("Seeded {$count} users, ".($count * $petsPer).' pets, '.count($vaxRows).' vaccinations.');
        $this->line('Pool written to: '.(realpath($out) ?: $out));
        $this->line('Safe offered load: up to ~'.($count * 2).' req/s before throttle:api (120/min/user) bites.');
        $this->line("Tokens expire in {$ttl} min (ACCESS_TOKEN_EXPIRE_MINUTES) — re-run this command for a longer test.");

        if ($ttl < 30) {
            $this->warn("ACCESS_TOKEN_EXPIRE_MINUTES is only {$ttl}; tokens may expire mid-run and show up as 401s.");
        }

        return self::SUCCESS;
    }

    /**
     * This command writes hundreds of accounts with a published password, so it
     * never runs anywhere real without an explicit, informed yes.
     */
    private function confirmTarget(int $count): bool
    {
        $conn = config('database.default');
        $host = config("database.connections.{$conn}.host");
        $name = config("database.connections.{$conn}.database");

        if (! $this->allowedEnvironment()) {
            return false;
        }

        $this->line("Target: <comment>{$name}</comment> on <comment>{$host}</comment> (APP_ENV=".app()->environment().')');
        $this->line("Creating {$count} users with the password \"".self::PASSWORD.'".');

        return $this->option('force') || $this->confirm('Continue?', false);
    }

    /**
     * This command ships with the app, so it is on the production server too,
     * and it seeds accounts that share a published password. Three locks:
     *
     *  1. An allow-list, not a production deny-list, so a mistyped or missing
     *     APP_ENV fails closed.
     *  2. Both app()->environment() AND config('app.env') must pass:
     *     `--env=local` on the command line overrides the former but not the
     *     latter, which still reads production's .env / cached config.
     *  3. Outside the test suite, LOADTEST_SEEDING=1 must be in the real
     *     process environment. Only loadtest/docker-compose.yml sets it. Read
     *     with getenv(), not env(): the stack caches config, and env() returns
     *     null under a config cache.
     */
    private function allowedEnvironment(): bool
    {
        $runtime = app()->environment();
        $configured = (string) config('app.env');

        if (! in_array($runtime, self::ALLOWED_ENVIRONMENTS, true) || ! in_array($configured, self::ALLOWED_ENVIRONMENTS, true)) {
            $this->error("Refusing to run: APP_ENV={$configured}".($runtime !== $configured ? " (--env={$runtime})" : '').' (allowed: '.implode(', ', self::ALLOWED_ENVIRONMENTS).').');
            $this->line('These accounts share one published password. Point this at the Docker load-test stack (docs/load-testing.md).');

            return false;
        }

        if ($configured !== 'testing' && getenv('LOADTEST_SEEDING') !== '1') {
            $this->error('Refusing to run: LOADTEST_SEEDING=1 is not set. Only the Docker load-test stack sets it (docs/load-testing.md).');

            return false;
        }

        return true;
    }

    /**
     * Only ever touches accounts this command created: the email prefix plus
     * the reserved `.test` domain can never match a real user. Pets, their
     * vaccinations and everything downstream go with them via cascade.
     */
    private function purge(): int
    {
        return User::where('email', 'like', self::EMAIL_PREFIX.'%'.self::EMAIL_DOMAIN)->delete();
    }

    private function writePool(string $path, array $pool): void
    {
        $dir = dirname($path);

        if (! is_dir($dir) && ! mkdir($dir, 0o775, true) && ! is_dir($dir)) {
            throw new \RuntimeException("Could not create {$dir}");
        }

        file_put_contents(
            $path,
            json_encode($pool, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL
        );
    }
}
