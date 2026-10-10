<?php

namespace App\Support;

/**
 * Catches a production mail config that accepts every message and delivers
 * none. Password resets and verification codes are sent after the response
 * with failures only logged, so a `log` mailer or a missing API key would
 * otherwise go unnoticed: the app says "code sent" and nothing arrives.
 */
final class MailDelivery
{
    /** Transports that accept a message and send it to no one. */
    private const DISCARDING = ['log', 'array'];

    /** Why mail from the running environment won't reach anyone, or null. */
    public static function problem(): ?string
    {
        if (! app()->isProduction()) {
            return null;
        }

        $mailer = (string) config('mail.default');
        $transport = config("mail.mailers.{$mailer}.transport");

        if ($transport === null) {
            return "MAIL_MAILER={$mailer} is not a configured mailer";
        }
        if (in_array($transport, self::DISCARDING, true)) {
            return "MAIL_MAILER={$mailer} discards every email (password resets, verification codes)";
        }
        if ($transport === 'resend' && blank(config('services.resend.key'))) {
            return 'MAIL_MAILER=resend but RESEND_API_KEY is not set';
        }
        if (str_ends_with(strtolower((string) config('mail.from.address')), '@example.com')) {
            return 'MAIL_FROM_ADDRESS is still the example.com placeholder';
        }

        return null;
    }
}
