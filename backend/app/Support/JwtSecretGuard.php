<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Refuses to sign or accept tokens with a guessable JWT signing key. Anyone
 * who knows the key can mint an access token for any user id, and the shipped
 * .env.example placeholder is public — so a deploy that copied .env.example
 * and forgot (or misnamed) SECRET_KEY must fail closed, not mint tokens.
 *
 * Enforced everywhere except local dev and the test suite (so staging,
 * preview, or a typo'd APP_ENV are covered too), at the point of use rather
 * than at boot — composer and artisan still work before a .env exists.
 */
class JwtSecretGuard
{
    /** The SECRET_KEY value shipped in backend/.env.example. */
    public const EXAMPLE_PLACEHOLDER = 'change-me-to-a-long-random-secret-in-production';

    public const MIN_LENGTH = 32;

    /** Environments where a placeholder key is tolerated. */
    private const RELAXED_ENVIRONMENTS = ['local', 'testing'];

    /** Log at most once per this many seconds, so a bad key can't flood the log. */
    private const REPORT_EVERY_SECONDS = 600;

    /** Why the key is unsafe for $environment, or null when it's fine. */
    public static function problem(string $environment, ?string $secret): ?string
    {
        if (in_array($environment, self::RELAXED_ENVIRONMENTS, true)) {
            return null;
        }

        $secret = (string) $secret;
        if ($secret === self::EXAMPLE_PLACEHOLDER) {
            return 'SECRET_KEY is the public .env.example placeholder';
        }
        if (strlen($secret) < self::MIN_LENGTH) {
            return 'SECRET_KEY is shorter than '.self::MIN_LENGTH.' characters';
        }

        return null;
    }

    /** Whether the configured key is safe for the running environment. */
    public static function isConfigured(): bool
    {
        return self::problem(app()->environment(), config('jwt.secret')) === null;
    }

    /**
     * Abort with 503 when the configured key is unsafe. Call before any
     * side effect in a flow that issues tokens, so a misconfiguration can't
     * leave half-finished signups or links behind.
     */
    public static function enforce(): void
    {
        $secret = config('jwt.secret');
        $problem = self::problem(app()->environment(), $secret);

        if ($problem === null) {
            // Not blocking: SECRET_KEY unset makes config/jwt.php fall back
            // to APP_KEY, which works but reuses the app's encryption key.
            if ($secret !== null && $secret === config('app.key') && ! app()->environment(self::RELAXED_ENVIRONMENTS)) {
                self::reportOnce('jwt-secret-guard:shares-app-key', 'warning',
                    'JWT signing key falls back to APP_KEY: set a separate random SECRET_KEY in .env.');
            }

            return;
        }

        self::reportOnce('jwt-secret-guard:unsafe', 'critical',
            "Refusing to sign or verify tokens: {$problem}. Set a random SECRET_KEY of at least "
            .self::MIN_LENGTH.' characters in .env (e.g. `openssl rand -base64 48`), then run `php artisan config:cache`.');

        abort(503, 'Sign-in is temporarily unavailable.');
    }

    private static function reportOnce(string $key, string $level, string $message): void
    {
        try {
            if (! Cache::add($key, true, self::REPORT_EVERY_SECONDS)) {
                return;
            }
        } catch (\Throwable) {
            // Cache unavailable: still log rather than stay silent.
        }
        Log::log($level, $message);
    }
}
