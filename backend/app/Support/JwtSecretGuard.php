<?php

namespace App\Support;

/**
 * Refuses to sign or accept tokens with a guessable JWT signing key. Anyone
 * who knows the key can mint an access token for any user id, and the shipped
 * .env.example placeholder is public — so a deploy that copied .env.example
 * and forgot (or misnamed) SECRET_KEY must fail closed, not mint tokens —
 * including when SECRET_KEY is unset and config/jwt.php falls back to APP_KEY.
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
    public static function problem(string $environment, ?string $secret, ?string $appKey = null): ?string
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
        // config/jwt.php falls back to APP_KEY when SECRET_KEY is unset — the
        // key that also encrypts app data. Require a dedicated one.
        if ($appKey !== null && $appKey !== '' && hash_equals($appKey, $secret)) {
            return 'SECRET_KEY is not set, so the signing key falls back to APP_KEY';
        }

        return null;
    }

    /** Why the configured key is unsafe for the running environment, or null. */
    private static function currentProblem(): ?string
    {
        return self::problem(app()->environment(), config('jwt.secret'), config('app.key'));
    }

    /** Whether the configured key is safe for the running environment. */
    public static function isConfigured(): bool
    {
        return self::currentProblem() === null;
    }

    /**
     * Abort with 503 when the configured key is unsafe. Call before any
     * side effect in a flow that issues tokens, so a misconfiguration can't
     * leave half-finished signups or links behind.
     */
    public static function enforce(): void
    {
        $problem = self::currentProblem();
        if ($problem === null) {
            return;
        }

        ReportOnce::log('jwt-secret-guard:unsafe', 'critical',
            "Refusing to sign or verify tokens: {$problem}. Set a random SECRET_KEY of at least "
            .self::MIN_LENGTH.' characters in .env (e.g. `openssl rand -base64 48`), then run `php artisan config:cache`.',
            self::REPORT_EVERY_SECONDS);

        abort(503, 'Sign-in is temporarily unavailable.');
    }
}
