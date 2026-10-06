<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Carbon;

class JwtService
{
    private static function secret(): string
    {
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
