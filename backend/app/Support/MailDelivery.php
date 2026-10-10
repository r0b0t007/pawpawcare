<?php

namespace App\Support;

use Illuminate\Support\Arr;
use Illuminate\Support\ConfigurationUrlParser;

/**
 * Catches a mail config that accepts messages and delivers none. Password
 * resets and verification codes are sent after the response with failures
 * only logged, so a `log` mailer or an SMTP host left at 127.0.0.1 would
 * otherwise go unnoticed: the app says "code sent" and nothing arrives.
 *
 * Static config only. Whether the server accepts the login is what
 * `mail:check` (run on every deploy) proves.
 */
final class MailDelivery
{
    /** Transports that accept a message and send it to no one. */
    private const DISCARDING = ['log', 'array'];

    private const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];

    /** Why mail sent through $mailer (default: MAIL_MAILER) won't reach anyone, or null. */
    public static function problem(?string $mailer = null): ?string
    {
        $mailer ??= (string) config('mail.default');

        return self::mailerProblem($mailer, depth: 0) ?? self::fromProblem();
    }

    private static function mailerProblem(string $mailer, int $depth): ?string
    {
        $config = self::config($mailer);
        $transport = $config['transport'] ?? null;

        if ($transport === null) {
            return "mailer {$mailer} is not configured";
        }
        if (in_array($transport, self::DISCARDING, true)) {
            return "mailer {$mailer} ({$transport}) discards every email (password resets, verification codes)";
        }
        // A failover chain falls back silently, so any member that drops mail
        // (the shipped `failover` ends in `log`) drops it for real.
        if (in_array($transport, ['failover', 'roundrobin'], true) && $depth < 3) {
            foreach ((array) ($config['mailers'] ?? []) as $member) {
                if ($problem = self::mailerProblem((string) $member, $depth + 1)) {
                    return "{$transport} mailer {$mailer}: {$problem}";
                }
            }

            return null;
        }
        if ($transport === 'smtp') {
            $host = strtolower(trim((string) ($config['host'] ?? '')));
            if ($host === '' || in_array(trim($host, '[]'), self::LOCAL_HOSTS, true)) {
                return "mailer {$mailer} (smtp) points at ".($host === '' ? 'no host' : $host).', so every send fails to connect';
            }
        }
        if ($transport === 'resend') {
            if (! class_exists(\Resend::class)) {
                return "mailer {$mailer} (resend) needs the resend/resend-php package, which isn't installed";
            }
            if (blank(config('services.resend.key'))) {
                return "mailer {$mailer} (resend) has no RESEND_API_KEY";
            }
        }

        return null;
    }

    private static function fromProblem(): ?string
    {
        $from = trim((string) config('mail.from.address'));

        if ($from === '') {
            return 'MAIL_FROM_ADDRESS is empty';
        }
        if (preg_match('/@(?:[^@]+\.)?example\.(?:com|org|net)$/i', $from)) {
            return "MAIL_FROM_ADDRESS is still a placeholder ({$from})";
        }

        return null;
    }

    /** The mailer's config as MailManager resolves it, MAIL_URL included. */
    private static function config(string $mailer): array
    {
        $config = (array) config("mail.mailers.{$mailer}", []);

        if (isset($config['url'])) {
            $config = array_merge($config, (new ConfigurationUrlParser)->parseConfiguration($config));
            $config['transport'] = Arr::pull($config, 'driver');
        }

        return $config;
    }
}
