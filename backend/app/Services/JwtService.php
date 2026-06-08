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

    public static function createAccessToken(string $userId): string
    {
        $now = now();
        $exp = $now->clone()->addMinutes((int) config('jwt.access_ttl'));

        return JWT::encode([
            'sub' => $userId,
            'type' => 'access',
            'iat' => $now->timestamp,
            'exp' => $exp->timestamp,
        ], self::secret(), self::algo());
    }

    /**
     * @return array{0: string, 1: Carbon} the token and its absolute expiry
     */
    public static function createRefreshToken(string $userId): array
    {
        $now = now();
        $exp = $now->clone()->addDays((int) config('jwt.refresh_ttl'));

        $token = JWT::encode([
            'sub' => $userId,
            'type' => 'refresh',
            'iat' => $now->timestamp,
            'exp' => $exp->timestamp,
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
