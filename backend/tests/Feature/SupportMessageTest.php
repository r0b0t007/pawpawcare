<?php

namespace Tests\Feature;

use App\Mail\SupportMessageMail;
use App\Models\SupportMessage;
use App\Models\User;
use App\Services\Analytics\ProductAnalytics;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
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

    public function test_feedback_keeps_its_category_and_app_context(): void
    {
        Mail::fake();
        config(['mail.support_inbox' => 'help@pawpawcare.app']);
        [$user, $token] = $this->user();

        $body = $this->withToken($token)
            ->postJson('/support/messages', [
                'message' => 'Reminders are great, export is confusing.',
                'category' => 'feedback',
                'app_version' => '1.4.0 (37)',
                'platform' => 'android',
            ])
            ->assertCreated()
            ->json();

        $this->assertSame('feedback', $body['category']);
        $stored = SupportMessage::where('user_id', $user->id)->sole();
        $this->assertSame(['feedback', '1.4.0 (37)', 'android'], [$stored->category, $stored->app_version, $stored->platform]);

        Mail::assertSent(SupportMessageMail::class, function (SupportMessageMail $mail) {
            $mail->assertSeeInHtml('1.4.0 (37) on android');
            $mail->assertSeeInHtml('Feedback');

            return $mail->envelope()->subject === '[Feedback] from Support User';
        });
    }

    public function test_older_apps_sending_only_a_message_still_work(): void
    {
        Mail::fake();
        config(['mail.support_inbox' => 'help@pawpawcare.app']);
        [, $token] = $this->user();

        $body = $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'Hello from an old build'])
            ->assertCreated()
            ->json();

        $this->assertNull($body['category']);
        Mail::assertSent(SupportMessageMail::class, function (SupportMessageMail $mail) {
            $mail->assertSeeInHtml('Not given');

            return $mail->envelope()->subject === 'Support message from Support User';
        });
    }

    public function test_unrecognised_context_is_dropped_never_blocking_the_message(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        [, $token] = $this->user();

        foreach ([
            [['category' => 'rant'], 'category', null],
            [['category' => ['feedback']], 'category', null],
            [['platform' => 'web'], 'platform', null],
            [['app_version' => '<script>'], 'app_version', 'script'],
            [['app_version' => '1.0.0_rc1'], 'app_version', '1.0.0_rc1'],
            [['app_version' => str_repeat('9', 40)], 'app_version', str_repeat('9', 32)],
            [['app_version' => "1.4.0\nBcc: x@evil.example"], 'app_version', '1.4.0Bcc xevil.example'],
            [['app_version' => '%%%'], 'app_version', null],
        ] as [$extra, $field, $expected]) {
            $this->withToken($token)
                ->postJson('/support/messages', ['message' => 'hi'] + $extra)
                ->assertCreated();

            $this->assertSame($expected, SupportMessage::sole()->{$field}, json_encode($extra));
            SupportMessage::query()->delete();
        }
    }

    public function test_the_subject_keeps_emoji_joiners_but_drops_bidi_overrides(): void
    {
        Mail::fake();
        config(['mail.support_inbox' => 'help@pawpawcare.app']);
        [$user, $token] = $this->user();
        $family = "Sam \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
        $user->forceFill(['name' => "{$family}\u{202E}cod"])->save();

        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'hi', 'category' => 'feedback'])
            ->assertCreated();

        Mail::assertSent(SupportMessageMail::class, fn (SupportMessageMail $mail) => $mail->envelope()->subject === "[Feedback] from {$family} cod");
    }

    public function test_every_category_has_a_label(): void
    {
        foreach (SupportMessage::CATEGORIES as $category) {
            $this->assertNotNull(SupportMessage::categoryLabel($category), $category);
        }
        $this->assertSame('Feedback', SupportMessage::categoryLabel('feedback'));
        $this->assertNull(SupportMessage::categoryLabel('rant'));
        $this->assertNull(SupportMessage::categoryLabel(null));
    }

    public function test_the_subject_flattens_control_characters_in_names(): void
    {
        Mail::fake();
        config(['mail.support_inbox' => 'help@pawpawcare.app']);
        [$user, $token] = $this->user();
        $user->forceFill(['name' => "Eve\r\nBcc: x@evil.example\t [Problem]"])->save();

        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'hi', 'category' => 'idea', 'user_id' => 'someone-else'])
            ->assertCreated();

        $this->assertSame($user->id, SupportMessage::sole()->user_id);
        Mail::assertSent(SupportMessageMail::class, fn (SupportMessageMail $mail) => $mail->envelope()->subject === '[Idea] from Eve Bcc: x@evil.example [Problem]');
    }

    public function test_analytics_get_the_category_never_the_message(): void
    {
        [$user, $token] = $this->user();
        $this->mock(ProductAnalytics::class)
            ->shouldReceive('capture')
            ->once()
            ->withArgs(fn ($who, $event, $props) => $who->is($user)
                && $event === 'server_support_message_sent'
                && $props === ['category' => 'idea']);

        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'Dark mode please', 'category' => 'idea'])
            ->assertCreated();
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

    public function test_feedback_has_its_own_budget_so_a_real_problem_still_gets_through(): void
    {
        [, $token] = $this->user();

        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)
                ->postJson('/support/messages', ['message' => "note {$i}", 'category' => $i % 2 ? 'idea' : 'feedback'])
                ->assertCreated();
        }
        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'one more idea', 'category' => 'idea'])
            ->assertStatus(429);

        // The help budget is still 5, so one user's ceiling is 10 an hour.
        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)
                ->postJson('/support/messages', ['message' => "help {$i}", 'category' => $i % 2 ? 'question' : 'problem'])
                ->assertCreated();
        }
        $this->withToken($token)
            ->postJson('/support/messages', ['message' => 'still stuck'])
            ->assertStatus(429);
        $this->assertSame(10, SupportMessage::count());
    }
}
