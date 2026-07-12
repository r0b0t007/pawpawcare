<?php

namespace Tests\Feature;

use App\Mail\SupportMessageMail;
use App\Models\SupportMessage;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SupportMessageTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(): array
    {
        $user = User::create([
            'name' => 'Support User',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    public function test_creates_a_support_message(): void
    {
        [$user, $token] = $this->user();

        $body = $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'My reminders stopped firing.'])
            ->assertCreated()
            ->json();

        $this->assertSame('My reminders stopped firing.', $body['message']);
        $this->assertNotEmpty($body['id']);
        $this->assertNotEmpty($body['created_at']);
        $this->assertSame(1, SupportMessage::where('user_id', $user->id)->count());
    }

    public function test_forwards_to_the_support_inbox_when_configured(): void
    {
        Mail::fake();
        config(['mail.support_inbox' => 'help@pawpawcare.app']);
        [, $token] = $this->user();

        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'Hello, humans!'])
            ->assertCreated();

        Mail::assertSent(SupportMessageMail::class, function (SupportMessageMail $mail) {
            return $mail->hasTo('help@pawpawcare.app')
                && $mail->supportMessage->message === 'Hello, humans!';
        });
    }

    public function test_message_is_required_and_capped_at_2000_chars(): void
    {
        [, $token] = $this->user();

        $this->withToken($token)->postJson('/support/messages', [])->assertStatus(422);
        $this->withToken($token)->postJson('/support/messages', ['message' => ''])->assertStatus(422);
        $this->withToken($token)
            ->postJson('/support/messages', ['message' => str_repeat('a', 2001)])
            ->assertStatus(422);

        $this->assertSame(0, SupportMessage::count());
    }

    public function test_requires_authentication(): void
    {
        $this->postJson('/support/messages', ['message' => 'anonymous'])->assertStatus(401);
        $this->assertSame(0, SupportMessage::count());
    }

    public function test_is_rate_limited_per_user(): void
    {
        [, $token] = $this->user();

        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)
                ->postJson('/support/messages', ['message' => "message {$i}"])
                ->assertCreated();
        }

        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'one too many'])
            ->assertStatus(429);
    }
}
