<?php

namespace Tests\Feature;

use App\Models\RefreshToken;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\JwtService;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * CHW-184: /auth/refresh is limited per refresh token, not per IP, so many
 * apps behind one carrier NAT address can all refresh.
 * CHW-185: costly authenticated routes add a per-network ceiling on top of
 * their per-user budget, so many free accounts can't multiply it.
 */
class RateLimitOuterTest extends TestCase
{
    use RefreshDatabase;

    private const NAT_IP = '203.0.113.9';

    /** @return array{0: User, 1: string, 2: string} user, access token, refresh token */
    private function user(): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
        ]);
        [$refresh, $expiresAt] = JwtService::createRefreshToken($u->id);
        RefreshToken::create(['user_id' => $u->id, 'token' => $refresh, 'expires_at' => $expiresAt, 'revoked' => false]);

        return [$u, JwtService::createAccessToken($u->id), $refresh];
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

    public function test_25_users_behind_one_ip_can_all_refresh_within_a_minute(): void
    {
        for ($i = 0; $i < 25; $i++) {
            [, , $refresh] = $this->user();
            $this->refresh($refresh)->assertOk();
        }
    }

    public function test_one_genuine_refresh_token_is_capped_on_its_own(): void
    {
        // Single-use: the first call rotates it, replays are 401 until its
        // own bucket (10/min) runs out — without touching anyone else's.
        [, , $replayed] = $this->user();
        $this->refresh($replayed)->assertOk();
        for ($i = 0; $i < 9; $i++) {
            $this->refresh($replayed)->assertStatus(401);
        }
        $this->refresh($replayed)->assertStatus(429);

        [, , $refresh] = $this->user();
        $this->refresh($refresh)->assertOk();
    }

    public function test_made_up_tokens_share_one_small_bucket_per_network(): void
    {
        // Each made-up string must NOT get its own bucket: keying attacker
        // input would let one client mint unlimited cache entries. They all
        // land in one 20/min bucket for the network …
        for ($i = 0; $i < 20; $i++) {
            $this->refresh('junk-'.$i)->assertStatus(401);
        }
        $this->refresh('junk-new')->assertStatus(429);

        // … which never blocks a genuine token from the same network,
        [, , $refresh] = $this->user();
        $this->refresh($refresh)->assertOk();
        // and other networks keep their own junk budget.
        $this->refresh('junk-x', '198.51.100.30')->assertStatus(401);

        // A refresh token that is longer than any real one is refused (422).
        [, , $ok] = $this->user();
        $this->refresh(str_repeat('a', 600), '198.51.100.31')->assertStatus(422);
        $this->refresh($ok, '198.51.100.31')->assertOk();
    }

    public function test_accounts_on_one_network_share_the_report_ceiling_but_keep_their_own_budget(): void
    {
        // Per user: 10 an hour. Per network: 50 an hour.
        $users = array_map(fn () => $this->user()[1], range(1, 6));

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
        $net = fn (string $ip) => AppServiceProvider::network(Request::create('/', 'GET', [], [], [], ['REMOTE_ADDR' => $ip]));

        $this->assertSame($net('2001:db8:1:2:aaaa::1'), $net('2001:db8:1:2:ffff::9'));
        $this->assertNotSame($net('2001:db8:1:2::1'), $net('2001:db8:1:3::1'));
        $this->assertSame('192.0.2.4', $net('::ffff:192.0.2.4'));
        $this->assertSame('192.0.2.4', $net('192.0.2.4'));
    }
}
