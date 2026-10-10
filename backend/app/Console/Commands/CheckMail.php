<?php

namespace App\Console\Commands;

use App\Support\MailDelivery;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\SmtpTransport;

/**
 * Proves the server can deliver mail before a user finds out by never
 * receiving a reset code: the config can't silently drop mail, and the SMTP
 * server accepts our login. deploy-backend.yml runs it after config:cache; a
 * failure is also an error log, so it reaches Sentry.
 */
class CheckMail extends Command
{
    protected $signature = 'mail:check {--send-to= : Also send a real test email to this address}';

    protected $description = 'Check that the configured mailer can deliver: config, SMTP login, and optionally a real test email.';

    public function handle(): int
    {
        $to = $this->option('send-to');
        if ($to !== null && ! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error("{$to} is not an email address.");

            return self::FAILURE;
        }

        if ($problem = MailDelivery::problem()) {
            return $this->reportFailure("{$problem}.");
        }

        $mailer = (string) config('mail.default');
        $transport = Mail::mailer($mailer)->getSymfonyTransport();

        if ($transport instanceof SmtpTransport) {
            try {
                $transport->start();
                $transport->stop();
                $this->info("SMTP login to {$transport} accepted.");
            } catch (\Throwable $e) {
                return $this->reportFailure('SMTP login failed: '.$e->getMessage());
            }
        }

        if ($to !== null) {
            try {
                Mail::mailer($mailer)->raw(
                    'This is a test email from the PawPawCare API. If you can read it, password resets and verification codes will arrive too.',
                    fn ($message) => $message->to($to)->subject('PawPawCare test email'),
                );
            } catch (\Throwable $e) {
                return $this->reportFailure('Sending failed: '.$e->getMessage());
            }
            $this->info("Test email sent to {$to} from ".config('mail.from.address').' (check spam too).');
        }

        $this->info("Mail OK ({$mailer} mailer).");

        return self::SUCCESS;
    }

    private function reportFailure(string $reason): int
    {
        $this->error("Mail check failed: {$reason}");
        Log::error("Mail check failed: {$reason}");

        return self::FAILURE;
    }
}
