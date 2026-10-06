<?php

namespace Tests\Feature;

use App\Mail\EmailVerificationCodeMail;
use App\Mail\PasswordResetCodeMail;
use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Pet invites are addressed by email alone and signup never verifies the
 * address, so an invite must not be claimable by whoever registers the
 * invited address first — only by someone who proves they own the inbox.
 */
class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(string $email, bool $verified): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => $email,
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        if ($verified) {
            $u->forceFill(['email_verified_at' => now()])->save();
        }

        return [$u, JwtService::createAccessToken($u->id)];
    }

    /** Owner invites $email; returns the invite id. */
    private function invite(string $email): array
    {
        [$owner, $ownerToken] = $this->user('owner'.uniqid().'@example.com', true);
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna']);
        $inviteId = $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $email])
            ->assertCreated()->json('id');

        return [$pet, $inviteId];
    }

    /** Request a code and return the plaintext captured from the fake mailer. */
    private function requestCode(string $token): string
    {
        $code = null;
        $this->withToken($token)->postJson('/users/me/email-verification')->assertOk()->assertJson(['status' => 'sent']);
        Mail::assertSent(EmailVerificationCodeMail::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    public function test_an_unverified_account_with_the_invited_email_cannot_see_or_accept_the_invite(): void
    {
        [$pet, $inviteId] = $this->invite('friend@example.com');
        // Someone registers the invited address before the real friend does.
        [, $claimantToken] = $this->user('friend@example.com', false);

        $this->withToken($claimantToken)->getJson('/invites')->assertOk()->assertJsonCount(0);
        $this->withToken($claimantToken)->postJson("/invites/{$inviteId}/accept")->assertForbidden();
        $this->withToken($claimantToken)->postJson("/invites/{$inviteId}/decline")->assertForbidden();
        $this->withToken($claimantToken)->getJson("/pets/{$pet->id}")->assertNotFound();
    }

    public function test_verifying_the_email_by_code_unlocks_invites(): void
    {
        Mail::fake();
        [$pet, $inviteId] = $this->invite('friend@example.com');
        [, $token] = $this->user('friend@example.com', false);

        $this->withToken($token)->getJson('/users/me')->assertJsonPath('email_verified', false);

        $code = $this->requestCode($token);
        $this->withToken($token)->postJson('/users/me/email-verification/confirm', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('email_verified', true);

        $this->withToken($token)->getJson('/invites')->assertJsonCount(1);
        $this->withToken($token)->postJson("/invites/{$inviteId}/accept")->assertOk();
        $this->withToken($token)->getJson("/pets/{$pet->id}")->assertOk();
    }

    public function test_a_wrong_code_is_rejected_and_five_misses_burn_it(): void
    {
        Mail::fake();
        [$user, $token] = $this->user('me@example.com', false);
        $code = $this->requestCode($token);
        $wrong = $code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)->postJson('/users/me/email-verification/confirm', ['code' => $wrong])->assertStatus(400);
        }
        // The real code no longer works once burned.
        $this->withToken($token)->postJson('/users/me/email-verification/confirm', ['code' => $code])->assertStatus(400);
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_a_new_code_invalidates_the_previous_one(): void
    {
        Mail::fake();
        [, $token] = $this->user('me@example.com', false);
        $first = $this->requestCode($token);
        $this->withToken($token)->postJson('/users/me/email-verification')->assertOk();

        // Only the latest code is live (unless both happen to collide).
        $latest = null;
        Mail::assertSent(EmailVerificationCodeMail::class, function ($mail) use (&$latest) {
            $latest = $mail->code;

            return true;
        });
        if ($latest !== $first) {
            $this->withToken($token)->postJson('/users/me/email-verification/confirm', ['code' => $first])->assertStatus(400);
        }
        $this->withToken($token)->postJson('/users/me/email-verification/confirm', ['code' => $latest])->assertOk();
    }

    public function test_completing_a_password_reset_verifies_the_email(): void
    {
        Mail::fake();
        [$user] = $this->user('me@example.com', false);

        $this->postJson('/auth/forgot-password', ['email' => 'me@example.com'])->assertOk();
        $code = null;
        Mail::assertSent(PasswordResetCodeMail::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });
        $this->postJson('/auth/reset-password', [
            'email' => 'me@example.com',
            'code' => $code,
            'password' => 'new-password-1',
        ])->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_non_ascii_emails_are_refused_at_every_entry_point(): void
    {
        // Production MySQL folds accents in comparisons, so a verified
        // `friend@exämple.com` would otherwise match an invite for
        // `friend@example.com`.
        $this->postJson('/auth/signup', ['name' => 'X', 'email' => 'friend@exämple.com', 'password' => 'secret123'])
            ->assertStatus(422);
        $this->postJson('/auth/login', ['email' => 'friënd@example.com', 'password' => 'x'])->assertStatus(422);
        $this->postJson('/auth/forgot-password', ['email' => 'friënd@example.com'])->assertStatus(422);

        [$owner, $ownerToken] = $this->user('owner@example.com', true);
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna']);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => 'friënd@example.com'])
            ->assertStatus(422);
    }

    public function test_code_requests_are_capped_per_user(): void
    {
        Mail::fake();
        [, $token] = $this->user('me@example.com', false);

        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)->postJson('/users/me/email-verification')->assertOk();
        }
        $this->withToken($token)->postJson('/users/me/email-verification')->assertStatus(429);
    }

    public function test_a_placeholder_social_email_cannot_request_a_code(): void
    {
        Mail::fake();
        [, $token] = $this->user('google_123@users.noreply.pawpawcare.app', false);

        $this->withToken($token)->postJson('/users/me/email-verification')->assertStatus(422);
        Mail::assertNothingSent();
    }

    public function test_an_already_verified_user_is_not_sent_a_code(): void
    {
        Mail::fake();
        [, $token] = $this->user('me@example.com', true);

        $this->withToken($token)->postJson('/users/me/email-verification')
            ->assertOk()
            ->assertJson(['status' => 'already_verified']);
        Mail::assertNothingSent();
    }
}
