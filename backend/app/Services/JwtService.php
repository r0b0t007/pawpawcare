<?php

namespace App\Services;

use App\Support\JwtSecretGuard;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Carbon;

class JwtService
{
    private static function secret(): string
    {
        // Fail closed at the point of use (not at boot, which would also break
        // composer/artisan before .env exists): a placeholder or weak key can
        // neither sign nor verify, so no token can be forged. The guard logs
        // the cause (rate-limited — decode() runs on every request).
        JwtSecretGuard::enforce();

        return (string) config('jwt.secret');
    }

    private static function algo(): string
    {
        return (string) config('jwt.algo');
    }

    /**
     * @param  int  $version  the user's current token_version; JwtAuth rejects
     *                        the token once the account's version moves past it
     */
    public static function createAccessToken(string $userId, int $version = 0): string
    {
        $now = now();
        $exp = $now->clone()->addMinutes((int) config('jwt.access_ttl'));

        return JWT::encode([
            'sub' => $userId,
            'type' => 'access',
            'ver' => $version,
            'iat' => $now->timestamp,
            'exp' => $exp->timestamp,
        ], self::secret(), self::algo());
    }

    /**
     * @return array{0: string, 1: Carbon} the token and its absolute expiry
     */
    public static function createRefreshToken(string $userId, int $version = 0): array
    {
        $now = now();
        $exp = $now->clone()->addDays((int) config('jwt.refresh_ttl'));

        $token = JWT::encode([
            'sub' => $userId,
            'type' => 'refresh',
            // Checked on refresh too, so a refresh racing a revocation can't
            // mint a fresh pair on the new version.
            'ver' => $version,
            'iat' => $now->timestamp,
            'exp' => $exp->timestamp,
            // Unique token id: without it, two refresh tokens issued for the same
            // user within the same second are byte-identical and collide on the
            // refresh_tokens.token unique index (a 500 on same-second re-auth).
            'jti' => bin2hex(random_bytes(16)),
        ], self::secret(), self::algo());

        return [$token, $exp];
    }

    /** Longest token the API accepts; real ones are well under it. */
    public const MAX_TOKEN_LENGTH = 512;

    /**
     * The user a refresh token was signed for, or null when it isn't a
     * refresh token we signed. Expiry is NOT checked: the rate limiter needs
     * to tell "ours, but expired" (count it against its user, then 401) apart
     * from "made up" (shared junk bucket). JWT::decode checks the signature
     * before the expiry, so an ExpiredException payload is genuine.
     */
    public static function refreshSubject(string $token): ?string
    {
        if (mb_strlen($token) > self::MAX_TOKEN_LENGTH) {
            return null;
        }
        try {
            $claims = (array) JWT::decode($token, new Key(self::secret(), self::algo()));
        } catch (ExpiredException $e) {
            $claims = (array) $e->getPayload();
        } catch (\Throwable) {
            return null;
        }

        return ($claims['type'] ?? null) === 'refresh' && is_string($claims['sub'] ?? null) ? $claims['sub'] : null;
    }

    /**
     * Decode a token, returning its claims, or null if invalid/expired.
     */
    public static function decode(string $token): ?array
    {
        try {
            return (array) JWT::decode($token, new Key(self::secret(), self::algo()));
        } catch (\Throwable) {
            return null;
        }
    }
}
