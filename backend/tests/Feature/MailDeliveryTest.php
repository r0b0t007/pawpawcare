<?php

namespace Tests\Feature;

use App\Support\MailDelivery;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MailDeliveryTest extends TestCase
{
    private function production(array $config = []): void
    {
        $this->app['env'] = 'production';
        config(array_merge([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'server215.web-hosting.com',
            'mail.from.address' => 'no-reply@pawpawcare.app',
        ], $config));
    }

    public function test_the_production_smtp_config_is_fine(): void
    {
        $this->production();

        $this->assertNull(MailDelivery::problem());
    }

    public function test_production_configs_that_deliver_nothing_are_caught(): void
    {
        $cases = [
            'log mailer' => [['mail.default' => 'log'], 'MAIL_MAILER=log discards every email'],
            'array mailer' => [['mail.default' => 'array'], 'MAIL_MAILER=array discards every email'],
            'unknown mailer' => [['mail.default' => 'resnd'], 'MAIL_MAILER=resnd is not a configured mailer'],
            'resend without a key' => [['mail.default' => 'resend', 'services.resend.key' => null], 'RESEND_API_KEY is not set'],
            'smtp to the local default' => [['mail.mailers.smtp.host' => '127.0.0.1'], 'MAIL_HOST is still the local default'],
            'placeholder from' => [['mail.from.address' => 'hello@example.com'], 'MAIL_FROM_ADDRESS is still the example.com placeholder'],
        ];

        foreach ($cases as $name => [$config, $expected]) {
            $this->production($config);
            $this->assertStringContainsString($expected, (string) MailDelivery::problem(), $name);
        }
    }

    public function test_local_and_test_environments_may_log_mail(): void
    {
        config(['mail.default' => 'log']);

        $this->assertNull(MailDelivery::problem());
    }

    public function test_a_discarded_email_in_production_is_logged_once_per_window(): void
    {
        $this->production(['mail.default' => 'array']);
        Log::spy();

        Mail::raw('one', fn ($m) => $m->to('a@example.org'));
        Mail::raw('two', fn ($m) => $m->to('b@example.org'));

        Log::shouldHaveReceived('log')
            ->with('error', 'Email not delivered: MAIL_MAILER=array discards every email (password resets, verification codes)')
            ->once();
    }

    public function test_send_test_refuses_a_broken_config(): void
    {
        $this->production(['mail.default' => 'log']);

        $this->artisan('mail:send-test', ['to' => 'owner@example.org'])
            ->expectsOutputToContain('Not sent: MAIL_MAILER=log discards every email')
            ->assertFailed();
    }

    public function test_send_test_rejects_a_non_address(): void
    {
        $this->artisan('mail:send-test', ['to' => 'not-an-email'])->assertFailed();
    }

    public function test_send_test_sends_through_the_configured_mailer(): void
    {
        config(['mail.default' => 'array']);

        $this->artisan('mail:send-test', ['to' => 'owner@example.org'])
            ->expectsOutputToContain('Sent via the array mailer')
            ->assertSuccessful();

        $sent = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent);
        $this->assertSame('owner@example.org', $sent->first()->getEnvelope()->getRecipients()[0]->getAddress());
    }
}
