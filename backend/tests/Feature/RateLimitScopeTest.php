<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Regression guard for the rate limiter being scoped per USER, not per IP.
 *
 * Laravel sorts each route's pipeline by the middleware priority list, which
 * puts AuthenticatesRequests ahead of ThrottleRequests. JwtAuth implements
 * that marker interface; drop it and the throttle middleware runs BEFORE
 * authentication, sees a null $request->user(), and falls back to keying by
 * $request->ip().
 *
 * That is invisible in normal use and catastrophic behind CGNAT: every mobile
 * user sharing a carrier egress IP shares one 120/min budget and 429s the rest.
 *
 * These tests all drive real HTTP requests, because the bug lives in middleware
 * ORDERING — asserting on the limiter closure in isolation passes either way.
 */
class RateLimitScopeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create([
            'owner_id' => $owner->id,
            'name' => 'Luna',
            'type' => 'cat',
            'weight_unit' => 'kg',
        ]);
    }

    private function authedGet(string $token, string $uri = '/users/me')
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->getJson($uri);
    }

    private function authedPost(string $token, string $uri, array $body = [])
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->postJson($uri, $body);
    }

    public function test_throttle_api_buckets_are_per_user_not_per_ip(): void
    {
        [, $tokenA] = $this->user();
        [, $tokenB] = $this->user();

        // Same source IP for both (the test client always is), so if the limiter
        // keyed by IP these would share one bucket and Remaining would keep
        // falling instead of resetting for the second user.
        $first = $this->authedGet($tokenA);
        $first->assertOk();
        $remainingAfterA = (int) $first->headers->get('X-RateLimit-Remaining');

        $second = $this->authedGet($tokenB);
        $second->assertOk();
        $remainingAfterB = (int) $second->headers->get('X-RateLimit-Remaining');

        $this->assertSame(
            $remainingAfterA,
            $remainingAfterB,
            'A second user on the same IP must start from its own full budget. '
            .'Equal remaining counts mean per-user buckets; a decrement means the '
            .'limiter fell back to keying by IP (middleware priority regression).'
        );
    }

    public function test_one_user_burning_the_budget_does_not_throttle_another(): void
    {
        [, $tokenA] = $this->user();
        [, $tokenB] = $this->user();

        // Spend A's 120/min allowance with real requests: seeding the cache key
        // directly would tie the test to the framework's private key format.
        for ($i = 0; $i < 120; $i++) {
            $this->authedGet($tokenA)->assertOk();
        }

        $this->authedGet($tokenA)->assertStatus(429);
        $this->authedGet($tokenB)->assertOk();
    }

    public function test_numeric_route_throttles_are_also_per_user(): void
    {
        // The numeric throttles (`throttle:20,1,share-link:` and friends) key off
        // Laravel's internal resolveRequestSignature(), a different code path to
        // the named limiters above, but one that reads $request->user() just the
        // same. It must be a genuinely numeric-throttled route: /notifications
        // carries only `throttle:api`, which would silently re-test the named
        // limiter instead.
        [$userA, $tokenA] = $this->user();
        [$userB, $tokenB] = $this->user();

        $a = $this->authedPost($tokenA, '/pets/'.$this->pet($userA)->id.'/share-link');
        $a->assertOk();

        $b = $this->authedPost($tokenB, '/pets/'.$this->pet($userB)->id.'/share-link');
        $b->assertOk();

        $this->assertSame(20, (int) $a->headers->get('X-RateLimit-Limit'), 'expected the share-link limit, not throttle:api');
        $this->assertSame(
            (int) $a->headers->get('X-RateLimit-Remaining'),
            (int) $b->headers->get('X-RateLimit-Remaining'),
        );
    }

    public function test_each_numeric_throttle_has_its_own_budget(): void
    {
        // resolveRequestSignature() has no route component, so without a distinct
        // $prefix per route every numeric throttle shares one counter per user.
        // That is not just a shared budget: RateLimiter::increment() sets the TTL
        // with cache->add(), so whichever route creates the key also decides the
        // window — an upload (1 min) would turn account deletion's 5-per-60-min
        // into 5 per minute.
        [$user, $token] = $this->user();
        $pet = $this->pet($user);

        $this->authedPost($token, '/pets/'.$pet->id.'/share-link')->assertOk();
        $this->authedPost($token, '/pets/'.$pet->id.'/share-link')->assertOk();

        $delete = $this->withHeaders([
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->deleteJson('/users/me');

        $delete->assertOk();
        $this->assertSame(5, (int) $delete->headers->get('X-RateLimit-Limit'));
        $this->assertSame(
            4,
            (int) $delete->headers->get('X-RateLimit-Remaining'),
            'Account deletion must start from its own 5/hour budget. A lower number '
            .'means the two share-link calls drained it, i.e. the throttle prefixes '
            .'in routes/api.php were lost.'
        );
    }

    public function test_every_numeric_throttle_has_a_prefix(): void
    {
        // The guard for test_each_numeric_throttle_has_its_own_budget: an
        // unprefixed `throttle:N,M` on a new route would silently share a
        // per-user counter (and its window) with every other unprefixed one.
        $missing = [];
        $prefixes = [];

        foreach (Route::getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middleware) {
                // The alias form and the class form (ThrottleRequests::with()).
                $throttle = '/^(?:throttle|Illuminate\\\\Routing\\\\Middleware\\\\ThrottleRequests(?:WithRedis)?):(\d+),(\d+)(?:,(.*))?$/';
                if (! is_string($middleware) || ! preg_match($throttle, $middleware, $m)) {
                    continue;
                }
                $name = $route->methods()[0].' /'.ltrim($route->uri(), '/');
                if (($m[3] ?? '') === '') {
                    $missing[] = $name;
                } else {
                    $prefixes[$m[3]][] = $name;
                }
            }
        }

        $this->assertSame([], $missing, 'Numeric throttles need a distinct prefix: throttle:N,M,<name>:');

        // The `auth:` group throttle legitimately covers the public /auth/*
        // routes, and only those. Anything else sharing a prefix (or borrowing
        // `auth:` outside /auth/) is a copy-paste slip.
        $shared = array_filter($prefixes, function ($routes, $prefix) {
            if ($prefix === 'auth:') {
                return array_filter($routes, fn ($r) => ! str_starts_with($r, 'POST /auth/')) !== [];
            }

            return count($routes) > 1;
        }, ARRAY_FILTER_USE_BOTH);
        $this->assertSame([], $shared, 'Two routes share a throttle prefix.');
    }

    public function test_public_routes_still_throttle_by_ip(): void
    {
        // Unauthenticated traffic has no user to key by, so the IP fallback is
        // correct and must keep working — it is what buckets anonymous floods.
        //
        // Note what this deliberately does NOT claim: since authentication now
        // runs before throttling, invalid-token requests to AUTHENTICATED routes
        // are rejected with 401 without consuming any budget. See the trade-off
        // in the JwtAuth docblock.
        //
        // /auth/signup carries only the group's `throttle:20,1,auth:`, so the
        // rate-limit headers are that bucket's (login adds a second limiter;
        // refresh has its own per-token limiter, see RateLimitOuterTest).
        $refresh = fn (string $ip) => $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/auth/signup', []);

        $first = $refresh('198.51.100.7')->assertStatus(422);
        $second = $refresh('198.51.100.7')->assertStatus(422);
        $otherIp = $refresh('198.51.100.8')->assertStatus(422);

        $this->assertSame(20, (int) $first->headers->get('X-RateLimit-Limit'));
        $this->assertSame(
            (int) $first->headers->get('X-RateLimit-Remaining') - 1,
            (int) $second->headers->get('X-RateLimit-Remaining'),
            'Two requests from one IP should draw on one bucket.'
        );
        $this->assertSame(
            (int) $first->headers->get('X-RateLimit-Remaining'),
            (int) $otherIp->headers->get('X-RateLimit-Remaining'),
            'A different IP should get its own bucket.'
        );
    }
}
