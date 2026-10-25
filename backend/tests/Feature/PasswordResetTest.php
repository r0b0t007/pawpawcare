<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCodeMail;
use App\Models\PasswordResetCode;
use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use PlantsDelegatedAccess;
    use RefreshDatabase;

    private function user(string $email = 'reset@example.com'): User
    {
        return User::create([
            'name' => 'Reset User',
            'email' => $email,
            'hashed_password' => Hash::make('oldpassword'),
            'timezone' => 'UTC',
        ]);
    }

    /** Request a code and capture the plaintext code from the sent mailable. */
    private function requestCode(string $email): string
    {
        Mail::fake();

        $this->postJson('/auth/forgot-password', ['email' => $email])
            ->assertOk()
            ->assertJson(['status' => 'ok']);

        $code = null;
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    public function test_full_reset_flow_updates_the_password(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);

        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertOk()->assertJson(['status' => 'ok']);

        // Old password dead, new one works.
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'oldpassword'])
            ->assertStatus(401);
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'newpassword99'])
            ->assertOk();
    }

    public function test_a_reset_on_a_never_verified_account_withdraws_the_access_it_handed_out(): void
    {
        // Signup doesn't check the address: the holder so far may not be the
        // inbox owner who now completes the reset.
        $user = $this->user();
        $planted = $this->plantAccess($user);
        $code = $this->requestCode($user->email);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email, 'code' => $code, 'password' => 'newpassword99',
        ])->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertAccessRevoked($planted);
    }

    public function test_a_reset_on_a_verified_account_keeps_its_sharing(): void
    {
        $user = $this->user();
        $user->forceFill(['email_verified_at' => now()->subMonth()])->save();
        $planted = $this->plantAccess($user);
        $code = $this->requestCode($user->email);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email, 'code' => $code, 'password' => 'newpassword99',
        ])->assertOk();

        $this->assertAccessKept($planted);
    }

    public function test_wrong_code_is_rejected_with_a_generic_message(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);
        $wrong = $code === '000000' ? '000001' : '000000';

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $wrong,
            'password' => 'newpassword99',
        ])->assertStatus(400)->assertJson(['detail' => 'Invalid or expired code']);

        // Password unchanged.
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'oldpassword'])
            ->assertOk();
    }

    public function test_expired_code_is_rejected(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);

        PasswordResetCode::where('user_id', $user->id)
            ->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertStatus(400)->assertJson(['detail' => 'Invalid or expired code']);
    }

    public function test_code_is_single_use(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertOk();

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'anotherpass123',
        ])->assertStatus(400)->assertJson(['detail' => 'Invalid or expired code']);
    }

    public function test_new_code_invalidates_the_previous_one(): void
    {
        $user = $this->user();
        $first = $this->requestCode($user->email);
        $this->requestCode($user->email);

        $this->assertSame(1, PasswordResetCode::where('user_id', $user->id)->count());

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $first,
            'password' => 'newpassword99',
        ])->assertStatus(400);
    }

    public function test_code_is_burned_after_five_wrong_guesses(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);
        $wrong = $code === '000000' ? '000001' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/auth/reset-password', [
                'email' => $user->email,
                'code' => $wrong,
                'password' => 'newpassword99',
            ])->assertStatus(400);
        }

        // Even the real code is dead now — brute-forcing burns the code.
        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertStatus(400);
    }

    public function test_unknown_email_still_returns_ok_and_sends_nothing(): void
    {
        Mail::fake();

        $this->postJson('/auth/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJson(['status' => 'ok']);

        Mail::assertNothingSent();
        $this->assertSame(0, PasswordResetCode::count());
    }

    public function test_only_the_code_hash_is_stored(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);

        $record = PasswordResetCode::where('user_id', $user->id)->first();
        $this->assertNotSame($code, $record->code_hash);
        $this->assertTrue(Hash::check($code, $record->code_hash));
    }

    public function test_forgot_password_is_rate_limited(): void
    {
        Mail::fake();
        $this->user();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/auth/forgot-password', ['email' => 'reset@example.com'])->assertOk();
        }

        $this->postJson('/auth/forgot-password', ['email' => 'reset@example.com'])
            ->assertStatus(429);
    }

    public function test_reset_password_is_rate_limited(): void
    {
        $user = $this->user();

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/auth/reset-password', [
                'email' => $user->email,
                'code' => '123456',
                'password' => 'newpassword99',
            ])->assertStatus(400);
        }

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => '123456',
            'password' => 'newpassword99',
        ])->assertStatus(429);
    }

    public function test_a_stranger_spending_the_reset_budget_cannot_block_the_owner_where_they_signed_in_before(): void
    {
        $user = $this->user();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.5'])
            ->postJson('/auth/login', ['email' => $user->email, 'password' => 'oldpassword'])->assertOk();

        // Ten wrong guesses from ten other networks spend the shared per-email budget.
        for ($i = 1; $i <= 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$i}"])->postJson('/auth/reset-password', [
                'email' => $user->email, 'code' => '123456', 'password' => 'newpassword99',
            ])->assertStatus(400);
        }
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.7'])->postJson('/auth/reset-password', [
            'email' => $user->email, 'code' => '123456', 'password' => 'newpassword99',
        ])->assertStatus(429);

        // The owner, on the network they signed in from, still gets through.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.5']);
        $code = $this->requestCode($user->email);
        $this->postJson('/auth/reset-password', [
            'email' => $user->email, 'code' => $code, 'password' => 'newpassword99',
        ])->assertOk();
    }

    public function test_a_stranger_spending_the_forgot_budget_cannot_stop_the_owner_asking_for_a_code(): void
    {
        Mail::fake();
        $user = $this->user();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.5'])
            ->postJson('/auth/login', ['email' => $user->email, 'password' => 'oldpassword'])->assertOk();

        for ($i = 1; $i <= 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$i}"])
                ->postJson('/auth/forgot-password', ['email' => $user->email])->assertOk();
        }
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.7'])
            ->postJson('/auth/forgot-password', ['email' => $user->email])->assertStatus(429);

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.5'])
            ->postJson('/auth/forgot-password', ['email' => $user->email])->assertOk();
    }

    /** Ask for a code bound to this request, as the app does: [code, request_id]. */
    private function requestBoundCode(string $email): array
    {
        Mail::fake();
        $requestId = $this->postJson('/auth/forgot-password', ['email' => $email, 'bind' => true])
            ->assertOk()->json('request_id');
        $code = null;
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return [$code, $requestId];
    }

    private function resetWith(string $email, string $code, ?string $requestId = null)
    {
        return $this->postJson('/auth/reset-password', array_filter([
            'email' => $email, 'code' => $code, 'password' => 'newpassword99', 'request_id' => $requestId,
        ]));
    }

    public function test_a_bound_code_resets_with_its_request_id(): void
    {
        $user = $this->user();
        [$code, $requestId] = $this->requestBoundCode($user->email);

        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $requestId);
        // Only its hash is stored.
        $this->assertSame(hash('sha256', $requestId), PasswordResetCode::sole()->request_hash);
        $this->resetWith($user->email, $code, $requestId)->assertOk();
    }

    public function test_an_unknown_email_gets_a_request_id_too(): void
    {
        Mail::fake();
        $this->postJson('/auth/forgot-password', ['email' => 'nobody@example.com', 'bind' => true])
            ->assertOk()->assertJsonStructure(['status', 'request_id']);
        Mail::assertNothingSent();
    }

    public function test_a_strangers_requests_do_not_cancel_a_bound_code(): void
    {
        $user = $this->user();
        [$code, $requestId] = $this->requestBoundCode($user->email);

        // From anywhere, bound or not (an older app's request).
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.1'])
            ->postJson('/auth/forgot-password', ['email' => $user->email, 'bind' => true])->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.2'])
            ->postJson('/auth/forgot-password', ['email' => $user->email])->assertOk();
        $this->assertSame(3, PasswordResetCode::where('user_id', $user->id)->count());

        $this->resetWith($user->email, $code, $requestId)->assertOk();
        // The stranger's codes were for the old password: they die with it.
        $this->assertSame(1, PasswordResetCode::where('user_id', $user->id)->count());
    }

    public function test_a_strangers_wrong_guesses_cannot_burn_a_bound_code(): void
    {
        $user = $this->user();
        [$code, $requestId] = $this->requestBoundCode($user->email);

        // Without the ID (an older app's path), or with a made-up one.
        for ($i = 0; $i < 5; $i++) {
            $this->resetWith($user->email, '000000')->assertStatus(400);
        }
        for ($i = 0; $i < 4; $i++) {
            $this->resetWith($user->email, '000000', bin2hex(random_bytes(32)))->assertStatus(400);
        }
        $this->assertSame(0, PasswordResetCode::sole()->attempts);

        $this->resetWith($user->email, $code, $requestId)->assertOk();
    }

    public function test_the_newest_code_works_after_asking_twice(): void
    {
        // Asked on wifi, asked again on mobile data, typed the newest email's
        // code: the app holds the newest request ID.
        $user = $this->user();
        $this->requestBoundCode($user->email);
        [$code, $requestId] = $this->requestBoundCode($user->email);

        $this->resetWith($user->email, $code, $requestId)->assertOk();
    }

    public function test_a_request_id_checks_only_its_own_code(): void
    {
        $user = $this->user();
        [, $firstId] = $this->requestBoundCode($user->email);
        [$secondCode] = $this->requestBoundCode($user->email);

        $this->resetWith($user->email, $secondCode, $firstId)->assertStatus(400);
    }

    public function test_a_bound_code_allows_five_checks(): void
    {
        $user = $this->user();
        [$code, $requestId] = $this->requestBoundCode($user->email);
        $wrong = $code === '000000' ? '000001' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->resetWith($user->email, $wrong, $requestId)->assertStatus(400);
        }
        $this->resetWith($user->email, $code, $requestId)->assertStatus(400);
    }

    public function test_reset_revokes_all_refresh_tokens(): void
    {
        $user = $this->user();

        // Two live sessions (the second inserted directly — two logins within
        // the same second would mint an identical, unique-constrained JWT).
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'oldpassword'])->assertOk();
        RefreshToken::create([
            'user_id' => $user->id,
            'token' => 'second-session-refresh-token',
            'expires_at' => now()->addDays(30),
            'revoked' => false,
        ]);
        $this->assertSame(2, RefreshToken::where('user_id', $user->id)->count());

        $code = $this->requestCode($user->email);
        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertOk();

        $this->assertSame(0, RefreshToken::where('user_id', $user->id)->count());
    }

    public function test_password_must_be_at_least_8_characters(): void
    {
        $user = $this->user();
        $code = $this->requestCode($user->email);

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'short',
        ])->assertStatus(422);
    }
}
