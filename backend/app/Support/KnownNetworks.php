<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;

/**
 * The networks (ClientNetwork) an account recently signed in from with its
 * password, or completed a password reset from. The per-email budgets for
 * failed logins, reset attempts and reset requests are shared by everyone
 * who names the email, so anyone could spend them to lock the owner out;
 * on one of these networks the owner gets a budget of their own instead
 * (AuthController::login, the forgot-password and password-reset limiters).
 *
 * Bound to the account and its current password: a reset, a Google/Apple
 * link (which drops the password) or a new account under the same email
 * starts the list over, so whoever held the old password, or squatted the
 * email, keeps no budget of their own. Only the most recent few are kept.
 * Listed in the privacy policy ("Sign-in networks").
 */
final class KnownNetworks
{
    /** How long a network stays known after the sign-in. */
    public const DAYS = 90;

    /** How many networks an account keeps (the most recent ones). */
    public const MAX = 3;

    /** Whether $user's account, with its current password, signed in from $network recently. */
    public static function has(?User $user, string $network): bool
    {
        if ($user === null) {
            return false;
        }
        $known = Cache::get(self::key($user->email));
        $seen = is_array($known) ? ($known['networks'][$network] ?? null) : null;

        return $seen !== null
            && $seen >= now()->subDays(self::DAYS)->timestamp
            && hash_equals((string) ($known['credential'] ?? ''), self::credential($user));
    }

    /** has() for an email, as the rate limiters see it. */
    public static function hasForEmail(string $email, string $network): bool
    {
        // The cache read first: most requests don't need the user lookup.
        if (! Cache::has(self::key($email))) {
            return false;
        }

        return self::has(User::where('email', $email)->first(), $network);
    }

    /** Add $network, keeping only the most recent few. Best effort: a busy lock just skips it. */
    public static function remember(User $user, string $network): void
    {
        $key = self::key($user->email);
        try {
            // Two sign-ins at once from different networks must not drop one.
            Cache::lock($key.':lock', 5)->block(2, function () use ($key, $user, $network) {
                $credential = self::credential($user);
                $known = Cache::get($key);
                $networks = is_array($known) && hash_equals((string) ($known['credential'] ?? ''), $credential)
                    ? (array) $known['networks']
                    : [];
                unset($networks[$network]);
                $networks[$network] = now()->timestamp;
                Cache::put($key, [
                    'credential' => $credential,
                    'networks' => array_slice($networks, -self::MAX, null, true),
                ], now()->addDays(self::DAYS));
            });
        } catch (LockTimeoutException) {
            // The network stays unknown: it shares the account-wide budget, as before.
        }
    }

    /** Drop every network remembered for $email (account purge). */
    public static function forget(string $email): void
    {
        Cache::forget(self::key($email));
    }

    private static function key(string $email): string
    {
        return 'login-known|'.sha1(strtolower(trim($email)));
    }

    private static function credential(User $user): string
    {
        return hash_hmac('sha256', $user->id.'|'.$user->hashed_password, (string) config('app.key'));
    }
}
