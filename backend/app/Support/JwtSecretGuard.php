<?php

namespace App\Support;

use RuntimeException;

/**
 * Refuses to run production with a guessable JWT signing key. Anyone who
 * knows the key can mint an access token for any user id, and the shipped
 * .env.example placeholder is public — so a deploy that copied .env.example
 * and forgot (or misnamed) SECRET_KEY must fail closed, not mint tokens.
 * Called from JwtService on every sign/verify rather than at boot, so
 * composer and artisan still work before a .env exists.
 */
class JwtSecretGuard
{
    /** The SECRET_KEY value shipped in backend/.env.example. */
    public const EXAMPLE_PLACEHOLDER = 'change-me-to-a-long-random-secret-in-production';

    public const MIN_LENGTH = 32;

    public static function assertSafe(bool $isProduction, ?string $secret): void
    {
        if (! $isProduction) {
            return;
        }

        $secret = (string) $secret;
        if ($secret === self::EXAMPLE_PLACEHOLDER || strlen($secret) < self::MIN_LENGTH) {
            throw new RuntimeException(
                'Refusing to sign or verify tokens: the JWT signing key (SECRET_KEY) is the .env.example placeholder '
                .'or shorter than '.self::MIN_LENGTH.' characters. Set a long random SECRET_KEY in .env '
                .'(e.g. `openssl rand -base64 48`), then run `php artisan config:cache`.'
            );
        }
    }
}
