<?php

namespace Tests\Feature;

use App\Models\RefreshToken;
use App\Models\User;
use App\Services\JwtService;
use App\Support\ClientNetwork;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * CHW-184: /auth/refresh and /auth/logout are limited per user (by the
 * refresh token they carry), not per IP, so many apps behind one carrier NAT
 * address can all refresh and sign out.
 * CHW-185: costly authenticated routes add a per-network ceiling on top of
 * their per-user budget, so many free accounts can't multiply it.
 */
class RateLimitOuterTest extends TestCase
{
    use RefreshDatabase;

    private const NAT_IP = '203.0.113.9';

    private function account(): User
    {
        return User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
    }

    private function refreshTokenFor(User $u): string
    {
        [$refresh, $expiresAt] = JwtService::createRefreshToken($u->id);
        RefreshToken::create(['user_id' => $u->id, 'token' => $refresh, 'expires_at' => $expiresAt, 'revoked' => false]);

        return $refresh;
    }

    private function refresh(string $token, string $ip = self::NAT_IP)
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/auth/refresh', ['refresh_token' => $token]);
    }

    private function report(string $access, string $ip = self::NAT_IP)
    {
        // A missing post 404s after the throttle has counted the request.
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->withHeaders(['Authorization' => 'Bearer '.$access, 'Accept' => 'application/json'])
            ->postJson('/community/posts/missing-post/report');
    }

    public function test_25_users_behind_one_ip_can_all_refresh_and_sign_out_within_a_minute(): void
    {
        for ($i = 0; $i < 25; $i++) {
            $user = $this->account();
            $next = $this->refresh($this->refreshTokenFor($user))->assertOk()->json('refresh_token');
            $this->withServerVariables(['REMOTE_ADDR' => self::NAT_IP])
                ->postJson('/auth/logout', ['refresh_token' => $next])
                ->assertSuccessful();
        }
    }

    public function test_chained_refreshes_count_against_the_user(): void
    {
        // Every answer is a new token; the budget follows the user, so one
        // account can't chain its way to the network ceiling (10/min each).
        $user = $this->account();
        $token = $this->refreshTokenFor($user);
        for ($i = 0; $i < 10; $i++) {
            $token = $this->refresh($token)->assertOk()->json('refresh_token');
        }
        $this->refresh($token)->assertStatus(429);

        // Someone else on the same network is unaffected.
        $this->refresh($this->refreshTokenFor($this->account()))->assertOk();
    }

    public function test_an_expired_genuine_token_is_not_treated_as_made_up(): void
    {
        // Fill the network's shared junk bucket (20/min) …
        for ($i = 0; $i < 20; $i++) {
            $this->refresh('junk-'.$i)->assertStatus(401);
        }
        $this->refresh('junk-new')->assertStatus(429);

        // … a token we signed that has since expired still gets its user's
        // own budget, so the app sees 401 (sign in again), not 429 (retry).
        $user = $this->account();
        $this->travel(-40)->days();
        $expired = $this->refreshTokenFor($user);
        $this->travelBack();
        $this->refresh($expired)->assertStatus(401);

        // A live token from the same network refreshes as usual.
        $this->refresh($this->refreshTokenFor($this->account()))->assertOk();
    }

    public function test_made_up_tokens_share_one_bucket_per_network_and_long_ones_are_refused(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->refresh('junk-'.$i)->assertStatus(401);
        }
        $this->refresh('junk-new')->assertStatus(429);
        // Other networks keep their own junk budget.
        $this->refresh('junk-x', '198.51.100.30')->assertStatus(401);

        // Longer than any real token: refused outright (422).
        $this->refresh(str_repeat('a', JwtService::MAX_TOKEN_LENGTH + 1), '198.51.100.31')->assertStatus(422);
    }

    public function test_accounts_on_one_network_share_the_report_ceiling_but_keep_their_own_budget(): void
    {
        // Per user: 10 an hour. Per network: 50 an hour.
        $users = array_map(fn () => JwtService::createAccessToken($this->account()->id), range(1, 6));

        // One account's own budget runs out at 10; another's is untouched.
        for ($i = 0; $i < 10; $i++) {
            $this->report($users[0])->assertNotFound();
        }
        $this->report($users[0])->assertStatus(429);
        $this->report($users[1])->assertNotFound();

        // Four more accounts fill the network's 50 …
        for ($u = 1; $u <= 4; $u++) {
            for ($i = $u === 1 ? 1 : 0; $i < 10; $i++) {
                $this->report($users[$u])->assertNotFound();
            }
        }
        // … so a sixth account on the same network is refused at once,
        $this->report($users[5])->assertStatus(429);
        // while the same account from another network still has its budget.
        $this->report($users[5], '198.51.100.20')->assertNotFound();
    }

    public function test_extract_and_invite_have_a_network_ceiling_too(): void
    {
        $limits = fn (string $name) => collect(app(RateLimiter::class)->limiter($name)(Request::create('/', 'POST')))
            ->map(fn ($l) => [$l->maxAttempts, $l->decaySeconds, explode('|', $l->key)[0]])
            ->all();

        $this->assertSame([[10, 60, 'doc-extract'], [60, 60, 'doc-extract-net']], $limits('doc-extract'));
        $this->assertSame([[20, 60, 'invite'], [60, 60, 'invite-net']], $limits('invite'));
    }

    public function test_ipv6_clients_are_grouped_by_their_64(): void
    {
        $net = fn (string $ip) => ClientNetwork::of(Request::create('/', 'GET', [], [], [], ['REMOTE_ADDR' => $ip]));

        $this->assertSame($net('2001:db8:1:2:aaaa::1'), $net('2001:db8:1:2:ffff::9'));
        $this->assertNotSame($net('2001:db8:1:2::1'), $net('2001:db8:1:3::1'));
        $this->assertSame('192.0.2.4', $net('::ffff:192.0.2.4'));
        $this->assertSame('192.0.2.4', $net('192.0.2.4'));
    }
}
