<?php

namespace App\Console\Commands;

use App\Support\MailDelivery;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Proves the server can actually deliver mail, end to end, before a user
 * finds out by never receiving a reset code. Run after changing MAIL_* or
 * RESEND_API_KEY (and `config:cache`).
 */
class SendTestMail extends Command
{
    protected $signature = 'mail:send-test {to : Address to send the test email to}';

    protected $description = 'Send a test email through the configured mailer and report any configuration problem.';

    public function handle(): int
    {
        $to = (string) $this->argument('to');

        if (! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error("{$to} is not an email address.");

            return self::FAILURE;
        }

        if ($problem = MailDelivery::problem()) {
            $this->error("Not sent: {$problem}.");

            return self::FAILURE;
        }

        try {
            Mail::raw(
                'This is a test email from the PawPawCare API. If you can read it, password resets and verification codes will arrive too.',
                fn ($message) => $message->to($to)->subject('PawPawCare test email'),
            );
        } catch (\Throwable $e) {
            $this->error('Sending failed: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Sent via the '.config('mail.default').' mailer from '.config('mail.from.address').". Check {$to}'s inbox (and spam).");

        return self::SUCCESS;
    }
}
