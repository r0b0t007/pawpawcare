<?php

namespace Tests\Feature;

use App\Support\MailDelivery;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MailDeliveryTest extends TestCase
{
    private const PRODUCTION_SMTP = [
        'mail.default' => 'smtp',
        'mail.mailers.smtp.host' => 'server215.web-hosting.com',
        'mail.from.address' => 'no-reply@pawpawcare.app',
    ];

    private function production(array $config = []): void
    {
        $this->app['env'] = 'production';
        config(array_merge(self::PRODUCTION_SMTP, $config));
    }

    public function test_the_production_smtp_config_is_fine(): void
    {
        config(self::PRODUCTION_SMTP);

        $this->assertNull(MailDelivery::problem());
    }

    public function test_a_mail_url_overrides_the_default_host(): void
    {
        config(self::PRODUCTION_SMTP);
        config([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.url' => 'smtp://no-reply%40pawpawcare.app:secret@server215.web-hosting.com:465',
        ]);

        $this->assertNull(MailDelivery::problem());
    }

    public function test_configs_that_deliver_nothing_are_caught(): void
    {
        $cases = [
            'log mailer' => [['mail.default' => 'log'], 'mailer log (log) discards every email'],
            'array mailer' => [['mail.default' => 'array'], 'mailer array (array) discards every email'],
            'unknown mailer' => [['mail.default' => 'resnd'], 'mailer resnd is not configured'],
            'failover ending in log' => [['mail.default' => 'failover'], 'failover mailer failover: mailer log (log) discards'],
            'smtp at the local default' => [['mail.mailers.smtp.host' => '127.0.0.1'], 'points at 127.0.0.1'],
            'smtp at LOCALHOST' => [['mail.mailers.smtp.host' => 'LOCALHOST'], 'points at localhost'],
            'smtp at ::1' => [['mail.mailers.smtp.host' => '[::1]'], 'points at [::1]'],
            'smtp with a blank host' => [['mail.mailers.smtp.host' => ''], 'points at no host'],
            'resend without its package' => [['mail.default' => 'resend', 'services.resend.key' => 're_x'], 'needs the resend/resend-php package'],
            'empty from' => [['mail.from.address' => ''], 'MAIL_FROM_ADDRESS is empty'],
            'example.org from' => [['mail.from.address' => 'noreply@example.org'], 'still a placeholder'],
            'example subdomain from' => [['mail.from.address' => 'a@mail.example.com'], 'still a placeholder'],
        ];

        foreach ($cases as $name => [$config, $expected]) {
            config(array_merge(self::PRODUCTION_SMTP, $config));
            $this->assertStringContainsString($expected, (string) MailDelivery::problem(), $name);
        }
    }

    public function test_a_discarded_email_in_production_is_logged_once_per_window_per_cause(): void
    {
        $this->production();
        config(['mail.mailers.array2' => ['transport' => 'array']]);
        Log::spy();

        // The default mailer is healthy; the alert follows the mailer that sent.
        Mail::mailer('array')->raw('one', fn ($m) => $m->to('a@example.org'));
        Mail::mailer('array')->raw('two', fn ($m) => $m->to('b@example.org'));
        Mail::mailer('array2')->raw('three', fn ($m) => $m->to('c@example.org'));

        Log::shouldHaveReceived('log')
            ->with('error', 'Email not delivered: mailer array (array) discards every email (password resets, verification codes)')
            ->once();
        Log::shouldHaveReceived('log')
            ->with('error', 'Email not delivered: mailer array2 (array) discards every email (password resets, verification codes)')
            ->once();
    }

    public function test_local_environments_may_log_mail_without_alerts(): void
    {
        config(['mail.default' => 'array']);
        Log::spy();

        Mail::raw('one', fn ($m) => $m->to('a@example.org'));

        Log::shouldNotHaveReceived('log');
    }

    public function test_check_fails_and_logs_a_broken_config_in_any_environment(): void
    {
        config(['mail.default' => 'log']);
        Log::spy();

        $this->artisan('mail:check')
            ->expectsOutputToContain('Mail check failed: mailer log (log) discards every email')
            ->assertFailed();

        Log::shouldHaveReceived('error')->withArgs(fn ($m) => str_starts_with($m, 'Mail check failed:'))->once();
    }

    public function test_check_reports_a_rejected_smtp_login(): void
    {
        config(self::PRODUCTION_SMTP);
        config(['mail.mailers.smtp.host' => 'smtp.invalid', 'mail.mailers.smtp.port' => 25, 'mail.mailers.smtp.timeout' => 2]);

        $this->artisan('mail:check')
            ->expectsOutputToContain('Mail check failed: SMTP login failed')
            ->assertFailed();
    }

    public function test_check_rejects_a_non_address(): void
    {
        $this->artisan('mail:check', ['--send-to' => 'not-an-email'])->assertFailed();
    }

    public function test_check_can_send_a_real_test_email(): void
    {
        // A non-discarding transport that still records what it sends.
        Mail::extend('recording', fn () => new ArrayTransport);
        config([
            'mail.mailers.recorder' => ['transport' => 'recording'],
            'mail.default' => 'recorder',
            'mail.from.address' => 'no-reply@pawpawcare.app',
        ]);

        $this->artisan('mail:check', ['--send-to' => 'owner@example.org'])
            ->expectsOutputToContain('Test email sent to owner@example.org')
            ->assertSuccessful();

        $sent = Mail::mailer('recorder')->getSymfonyTransport()->messages();
        $this->assertCount(1, $sent);
        $this->assertSame('owner@example.org', $sent->first()->getEnvelope()->getRecipients()[0]->getAddress());
    }
}
