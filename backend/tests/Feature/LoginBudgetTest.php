<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Password guessing against one account is bounded no matter how many source
 * addresses the guesses come from.
 */
class LoginBudgetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        User::create([
            'name' => 'Victim',
            'email' => 'victim@example.com',
            'hashed_password' => Hash::make('correct-horse'),
            'timezone' => 'UTC',
        ]);
    }

    private function loginFrom(string $ip, string $password, string $email = 'victim@example.com')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/auth/login', ['email' => $email, 'password' => $password]);
    }

    public function test_failures_spread_across_many_addresses_lock_the_account(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $this->loginFrom("192.0.2.{$i}", "guess-{$i}")->assertStatus(401);
        }

        // An 11th attempt from yet another address is refused before the
        // password is even checked — including the correct one.
        $this->loginFrom('198.51.100.7', 'guess-11')->assertStatus(429);
        $this->loginFrom('198.51.100.8', 'correct-horse')->assertStatus(429);
    }

    public function test_the_budget_also_applies_to_an_ipv6_slash_64_and_case_variants(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $email = $i % 2 ? 'Victim@Example.com' : 'victim@example.com';
            $this->loginFrom("2001:db8:0:7::{$i}", "guess-{$i}", $email)->assertStatus(401);
        }

        $this->loginFrom('2001:db8:0:7::ff', 'correct-horse')->assertStatus(429);
    }

    public function test_a_successful_login_clears_the_failure_count(): void
    {
        for ($i = 1; $i <= 9; $i++) {
            $this->loginFrom("192.0.2.{$i}", "guess-{$i}")->assertStatus(401);
        }
        $this->loginFrom('192.0.2.50', 'correct-horse')->assertOk();

        // Fresh budget after the success.
        for ($i = 1; $i <= 9; $i++) {
            $this->loginFrom("192.0.2.{$i}", "again-{$i}")->assertStatus(401);
        }
        $this->loginFrom('192.0.2.51', 'correct-horse')->assertOk();
    }

    public function test_unknown_emails_are_budgeted_too(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $this->loginFrom("192.0.2.{$i}", 'x', 'nobody@example.com')->assertStatus(401);
        }

        // Same response as a real account: the lockout reveals nothing.
        $this->loginFrom('192.0.2.99', 'x', 'nobody@example.com')->assertStatus(429);
    }

    public function test_a_password_reset_lifts_the_lock(): void
    {
        Mail::fake();
        for ($i = 1; $i <= 10; $i++) {
            $this->loginFrom("192.0.2.{$i}", "guess-{$i}")->assertStatus(401);
        }
        $this->loginFrom('192.0.2.50', 'correct-horse')->assertStatus(429);

        $this->postJson('/auth/forgot-password', ['email' => 'victim@example.com'])->assertOk();
        $code = null;
        Mail::assertSent(PasswordResetCodeMail::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });
        $this->postJson('/auth/reset-password', [
            'email' => 'victim@example.com',
            'code' => $code,
            'password' => 'new-password-1',
        ])->assertOk();

        $this->loginFrom('192.0.2.51', 'new-password-1')->assertOk();
    }

    public function test_ipv4_mapped_addresses_are_not_lumped_into_one_bucket(): void
    {
        for ($i = 1; $i <= 21; $i++) {
            $this->loginFrom("::ffff:192.0.2.{$i}", 'x', "user{$i}@example.com")->assertStatus(401);
        }
    }

    public function test_one_ipv6_network_is_throttled_as_a_single_source(): void
    {
        // 20 per minute per /64, across *different* accounts.
        for ($i = 1; $i <= 20; $i++) {
            $this->loginFrom("2001:db8:0:9::{$i}", 'x', "user{$i}@example.com")->assertStatus(401);
        }

        $this->loginFrom('2001:db8:0:9::99', 'x', 'user99@example.com')->assertStatus(429);
    }
}
