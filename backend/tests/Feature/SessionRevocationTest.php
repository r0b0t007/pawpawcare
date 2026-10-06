<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCodeMail;
use App\Models\RefreshToken;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * A password reset hands the account to whoever controls the inbox, so every
 * credential issued before it — refresh tokens, live access tokens, push
 * device bindings — must stop working at once.
 */
class SessionRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function resetPassword(string $email): void
    {
        Mail::fake();
        $this->postJson('/auth/forgot-password', ['email' => $email])->assertOk();
        $code = null;
        Mail::assertSent(PasswordResetCodeMail::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });
        $this->postJson('/auth/reset-password', [
            'email' => $email,
            'code' => $code,
            'password' => 'brand-new-password',
        ])->assertOk();
    }

    public function test_password_reset_revokes_live_access_tokens_and_devices(): void
    {
        $old = $this->postJson('/auth/signup', [
            'name' => 'U',
            'email' => 'me@example.com',
            'password' => 'old-password',
        ])->assertCreated()->json();
        $this->withToken($old['access_token'])
            ->postJson('/devices', ['token' => 'ExponentPushToken[old-device]'])
            ->assertOk();

        $this->resetPassword('me@example.com');

        $this->withToken($old['access_token'])->getJson('/users/me')->assertStatus(401);
        $this->postJson('/auth/refresh', ['refresh_token' => $old['refresh_token']])->assertStatus(401);
        $this->assertSame(0, User::where('email', 'me@example.com')->first()->deviceTokens()->count());

        // A fresh login gets a working token on the new version.
        $fresh = $this->postJson('/auth/login', ['email' => 'me@example.com', 'password' => 'brand-new-password'])
            ->assertOk()->json('access_token');
        $this->withToken($fresh)->getJson('/users/me')->assertOk();
    }

    public function test_a_refresh_token_minted_before_revocation_is_dead_even_if_its_row_survives(): void
    {
        $tokens = $this->postJson('/auth/signup', [
            'name' => 'U',
            'email' => 'me@example.com',
            'password' => 'old-password',
        ])->assertCreated()->json();
        $user = User::where('email', 'me@example.com')->first();

        // Simulate a refresh racing the revocation: the version is bumped but
        // the old refresh row is (re)inserted after the delete.
        $row = RefreshToken::where('token', $tokens['refresh_token'])->first()->replicate();
        $user->revokeAllSessions();
        $row->save();

        $this->postJson('/auth/refresh', ['refresh_token' => $tokens['refresh_token']])->assertStatus(401);
    }

    public function test_a_refresh_token_cannot_be_used_twice(): void
    {
        $refresh = $this->postJson('/auth/signup', [
            'name' => 'U',
            'email' => 'me@example.com',
            'password' => 'old-password',
        ])->assertCreated()->json('refresh_token');

        $this->postJson('/auth/refresh', ['refresh_token' => $refresh])->assertOk();
        $this->postJson('/auth/refresh', ['refresh_token' => $refresh])->assertStatus(401);
    }

    public function test_tokens_minted_before_the_ver_claim_work_until_a_revocation(): void
    {
        $user = User::create(['name' => 'U', 'email' => 'legacy@example.com', 'timezone' => 'UTC']);
        // The shape JwtService produced before `ver` existed.
        $legacy = JWT::encode([
            'sub' => $user->id, 'type' => 'access', 'iat' => now()->timestamp, 'exp' => now()->addHour()->timestamp,
        ], (string) config('jwt.secret'), (string) config('jwt.algo'));

        $this->withToken($legacy)->getJson('/users/me')->assertOk();

        $user->revokeAllSessions();

        $this->withToken($legacy)->getJson('/users/me')->assertStatus(401);
    }

    public function test_account_deletion_kills_access_tokens_even_after_reactivation(): void
    {
        $old = $this->postJson('/auth/signup', [
            'name' => 'U',
            'email' => 'me@example.com',
            'password' => 'old-password',
        ])->assertCreated()->json('access_token');

        $this->withToken($old)->deleteJson('/users/me')->assertOk();

        // Logging back in during the grace period reactivates the account...
        $fresh = $this->postJson('/auth/login', ['email' => 'me@example.com', 'password' => 'old-password'])
            ->assertOk()->json('access_token');

        // ...but the pre-deletion token stays dead.
        $this->withToken($old)->getJson('/users/me')->assertStatus(401);
        $this->withToken($fresh)->getJson('/users/me')->assertOk();
    }

    public function test_tokens_survive_when_nothing_was_revoked(): void
    {
        $access = $this->postJson('/auth/signup', [
            'name' => 'U',
            'email' => 'me@example.com',
            'password' => 'old-password',
        ])->assertCreated()->json('access_token');

        $this->withToken($access)->getJson('/users/me')->assertOk();
    }
}
