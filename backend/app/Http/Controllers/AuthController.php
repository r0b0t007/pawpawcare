<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetCodeMail;
use App\Models\DeviceToken;
use App\Models\PasswordResetCode;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\JwtService;
use App\Support\ClientNetwork;
use App\Support\JwtSecretGuard;
use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\SignatureInvalidException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    /** Failed password logins allowed per budget per window (see login()). */
    private const LOGIN_FAILURES_PER_WINDOW = 10;

    private const LOGIN_FAILURE_WINDOW_SECONDS = 900;

    /** How long a network the account signed in from keeps its own failure budget. */
    private const LOGIN_KNOWN_NETWORK_DAYS = 90;

    /** How many such networks an account keeps (the most recent ones). */
    private const LOGIN_KNOWN_NETWORKS = 3;

    public function signup(Request $request): JsonResponse
    {
        JwtSecretGuard::enforce(); // before any side effect: no half-made accounts on a bad key

        $data = $request->validate([
            'name' => 'required|string|min:1|max:100',
            'email' => 'required|email|ascii|max:255',
            'password' => 'required|string|min:6',
        ]);

        if (User::where('email', $data['email'])->exists()) {
            abort(409, __('Email already registered'));
        }

        $user = new User([
            'name' => $data['name'],
            'email' => $data['email'],
            'hashed_password' => Hash::make($data['password']),
        ]);
        $user->locale = User::requestLocale();
        $user->save();

        return response()->json($this->issueTokens($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        JwtSecretGuard::enforce(); // before any side effect: no half-made accounts on a bad key

        $data = $request->validate([
            'email' => 'required|email|ascii|max:255',
            'password' => 'required|string',
        ]);

        // Per-account failure budget, independent of source address: the
        // route's per-IP throttle alone lets a caller with many addresses (an
        // IPv6 /64, a proxy pool) guess one account's password without limit.
        // Counted for unknown emails too, so a lockout reveals nothing.
        // The attempt is counted BEFORE the (slow) bcrypt check, so a parallel
        // burst can't all pass the check at once; a success clears it.
        //
        // That shared budget is one anyone who knows the email can spend, so
        // a network the account signed in from recently gets a budget of its
        // own: someone failing elsewhere can't lock the owner out there.
        // Guessing from new networks stays bounded by the shared budget.
        $network = ClientNetwork::of($request);
        $failKey = self::isKnownNetwork($data['email'], $network)
            ? self::loginFailKey($data['email']).'|'.$network
            : self::loginFailKey($data['email']);
        $locked = __('Too many failed sign-in attempts for this account. Try again in 15 minutes or reset your password.');
        if (RateLimiter::tooManyAttempts($failKey, self::LOGIN_FAILURES_PER_WINDOW)) {
            abort(429, $locked);
        }
        if (RateLimiter::hit($failKey, self::LOGIN_FAILURE_WINDOW_SECONDS) > self::LOGIN_FAILURES_PER_WINDOW) {
            abort(429, $locked);
        }

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->hashed_password)) {
            abort(401, __('Invalid email or password'));
        }

        RateLimiter::clear($failKey);

        $reactivated = $this->reactivateOrRejectDisabled($user, 'password');
        self::rememberNetwork($user, $network);

        return response()->json(
            $this->issueTokens($user) + ($reactivated ? ['reactivated' => true] : [])
        );
    }

    /**
     * Sign in with Google. The client sends the Google-issued ID token (from
     * the react-native-google-signin module, configured with our Web client
     * ID). We verify it against Google's public keys — never trusting any
     * claim until the signature, issuer and audience check out — then
     * find/link/create the user.
     */
    public function google(Request $request): JsonResponse
    {
        JwtSecretGuard::enforce(); // before any side effect: no half-made accounts on a bad key

        $data = $request->validate([
            'id_token' => 'required|string',
        ]);

        $payload = $this->verifyIdToken(
            $data['id_token'],
            'https://www.googleapis.com/oauth2/v3/certs',
            ['accounts.google.com', 'https://accounts.google.com'],
            config('services.google.client_id'),
        );

        [$user, $reactivated] = $this->loginSocialUser(
            'google',
            (string) $payload['sub'],
            $payload['email'] ?? null,
            filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            $payload['name'] ?? null,
        );

        return response()->json(
            $this->issueTokens($user) + ($reactivated ? ['reactivated' => true] : [])
        );
    }

    /**
     * Sign in with Apple. The client sends the identity token from the native
     * Sign in with Apple flow (iOS only). We verify it against Apple's public
     * keys plus the nonce the app committed to, guarding against replay.
     */
    public function apple(Request $request): JsonResponse
    {
        JwtSecretGuard::enforce(); // before any side effect: no half-made accounts on a bad key

        $data = $request->validate([
            'identity_token' => 'required|string',
            // Required, never optional: the native Sign in with Apple flow always
            // commits a nonce, and making the check skippable would let anyone who
            // captures a still-valid identity token replay it by simply omitting
            // the nonce.
            'raw_nonce' => 'required|string|max:255',
            'full_name' => 'nullable|string|max:100',
        ]);

        $payload = $this->verifyIdToken(
            $data['identity_token'],
            'https://appleid.apple.com/auth/keys',
            ['https://appleid.apple.com'],
            config('services.apple.bundle_id'),
        );

        // Replay protection: the app hashes a random nonce (SHA-256) before the
        // native request, so the token's `nonce` claim must equal SHA-256(raw).
        // Always enforced — a token whose nonce we can't match is rejected.
        if (! hash_equals(hash('sha256', $data['raw_nonce']), (string) ($payload['nonce'] ?? ''))) {
            abort(401, __('Invalid identity token'));
        }

        [$user, $reactivated] = $this->loginSocialUser(
            'apple',
            (string) $payload['sub'],
            $payload['email'] ?? null,
            // Apple only ever returns emails it has already verified.
            filter_var($payload['email_verified'] ?? true, FILTER_VALIDATE_BOOLEAN),
            $data['full_name'] ?? null,
        );

        return response()->json(
            $this->issueTokens($user) + ($reactivated ? ['reactivated' => true] : [])
        );
    }

    public function refresh(Request $request): JsonResponse
    {
        JwtSecretGuard::enforce(); // before any side effect: no half-made accounts on a bad key

        $data = $request->validate([
            'refresh_token' => 'required|string|max:'.JwtService::MAX_TOKEN_LENGTH,
        ]);

        $payload = JwtService::decode($data['refresh_token']);

        if (! $payload || ($payload['type'] ?? null) !== 'refresh') {
            abort(401, __('Invalid refresh token'));
        }

        $stored = RefreshToken::where('token', $data['refresh_token'])
            ->where('revoked', false)
            ->first();

        if (! $stored || $stored->expires_at->isPast()) {
            abort(401, __('Refresh token expired or revoked'));
        }

        // Consume atomically: of two parallel refreshes with one token, only
        // the request that flips `revoked` gets a new pair.
        $consumed = RefreshToken::where('id', $stored->id)->where('revoked', false)->update(['revoked' => true]);
        if ($consumed !== 1) {
            abort(401, __('Refresh token expired or revoked'));
        }

        $userId = $payload['sub'];
        $user = User::find($userId);

        // Disabled accounts (banned or pending deletion) can't mint new
        // sessions by refreshing — reactivation only happens via login. A
        // token minted before User::revokeAllSessions() is dead too, even if
        // it slipped past the refresh-token delete.
        if (! $user || ! $user->is_active || (int) ($payload['ver'] ?? 0) !== (int) $user->token_version) {
            abort(401, __('Invalid refresh token'));
        }

        return response()->json($this->issueTokens($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => 'required|string|max:'.JwtService::MAX_TOKEN_LENGTH,
            'device_token' => 'sometimes|nullable|string|max:255',
        ]);

        $refresh = RefreshToken::where('token', $data['refresh_token'])->first();
        if ($refresh) {
            $refresh->update(['revoked' => true]);

            // Signing out also stops push to that phone. Done here as well as
            // DELETE /devices because the app retries a sign-out made offline
            // later, when it no longer holds an access token. Scoped to the
            // refresh token's owner: one account can't unregister another's.
            if (! empty($data['device_token'])) {
                DeviceToken::where('token', $data['device_token'])
                    ->where('user_id', $refresh->user_id)
                    ->delete();
            }
        }

        return response()->json(null, 204);
    }

    /**
     * Start the code-based password reset. Always answers 200 with the same
     * body whether or not the email has an account, so the endpoint can't be
     * used to enumerate registered addresses.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email|ascii|max:255',
        ]);

        // Pending-deletion accounts may still reset: "log back in to cancel
        // deletion" must work even for a user who forgot their password.
        $user = User::where('email', $data['email'])
            ->where(fn ($q) => $q->where('is_active', true)->orWhereNotNull('deletion_requested_at'))
            ->first();

        if ($user) {
            // A new request invalidates every earlier code for this user.
            PasswordResetCode::where('user_id', $user->id)->delete();

            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            PasswordResetCode::create([
                'user_id' => $user->id,
                'code_hash' => Hash::make($code),
                'expires_at' => now()->addMinutes(30),
            ]);

            // Send AFTER the response: a synchronous SMTP round trip would make
            // known-email requests measurably slower than unknown ones, turning
            // response latency into an account-enumeration oracle. Running in
            // the terminating phase keeps the plaintext code out of any queue
            // store while removing delivery time from the response.
            $email = $user->email;
            $locale = $user->preferredLocale(); // written in the user's language
            dispatch(function () use ($email, $locale, $code) {
                try {
                    Mail::to($email)->locale($locale)->send(new PasswordResetCodeMail($code));
                } catch (\Throwable $e) {
                    Log::error('Password reset email failed', ['error' => $e->getMessage()]);
                }
            })->afterResponse();
        } else {
            // Burn comparable time for unknown emails so response latency
            // can't be used as an account-enumeration oracle.
            Hash::make('000000');
        }

        return response()->json(['status' => 'ok']);
    }

    /** Complete the reset: verify the emailed code, set the new password. */
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email|ascii|max:255',
            'code' => 'required|string|max:10',
            'password' => 'required|string|min:8',
        ]);

        // One generic message for every failure mode — wrong email, wrong
        // code, expired or already used — so responses reveal nothing.
        // Pending-deletion accounts are included (mirrors forgotPassword).
        $user = User::where('email', $data['email'])
            ->where(fn ($q) => $q->where('is_active', true)->orWhereNotNull('deletion_requested_at'))
            ->first();

        $record = $user
            ? PasswordResetCode::where('user_id', $user->id)
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->latest('created_at')
                ->first()
            : null;

        // Per-code attempt cap: at most five comparisons ever run against one
        // code. The attempt is reserved with one conditional UPDATE *before*
        // the compare, so parallel guesses can't each read a stale count.
        $reserved = $record
            ? PasswordResetCode::where('id', $record->id)
                ->whereNull('used_at')
                ->where('attempts', '<', 5)
                ->increment('attempts')
            : 0;

        if ($reserved !== 1 || ! Hash::check($data['code'], $record->code_hash)) {
            abort(400, __('Invalid or expired code'));
        }

        // Single-use: only the request that marks it used resets the password.
        if (PasswordResetCode::where('id', $record->id)->whereNull('used_at')->update(['used_at' => now()]) !== 1) {
            abort(400, __('Invalid or expired code'));
        }
        $user->update(['hashed_password' => Hash::make($data['password'])]);

        // Completing a reset proves inbox ownership. On an account that never
        // had, the previous holder may not have been the inbox owner: like a
        // Google/Apple link (loginSocialUser), withdraw the access it handed
        // out. Every existing session dies too (stolen refresh tokens, live
        // access tokens, push bindings), in the same transaction, so the old
        // holder can't hand out new access in between.
        DB::transaction(function () use ($user) {
            $neverVerified = $user->email_verified_at === null;
            if ($neverVerified) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }
            $user->revokeAllSessions();
            if ($neverVerified) {
                $user->revokeDelegatedAccess();
            }
        });

        // ...so also cancel a pending self-deletion: the user can simply log
        // in with the new password.
        if (! $user->is_active && $user->deletion_requested_at !== null
            && ! $user->cancelPendingDeletion('password_reset')) {
            abort(400, __('Invalid or expired code')); // purged meanwhile
        }

        // The lockout message tells users to reset; a reset must lift it, and
        // proves the inbox, so the network it came from counts as the owner's.
        $network = ClientNetwork::of($request);
        RateLimiter::clear(self::loginFailKey($user->email));
        RateLimiter::clear(self::loginFailKey($user->email).'|'.$network);
        self::rememberNetwork($user, $network);

        return response()->json(['status' => 'ok']);
    }

    /**
     * Verify a provider ID/identity token against the provider's published
     * JWKS, then assert issuer and audience. Returns the decoded claims, or
     * aborts 401 on any failure. The JWKS is cached (with a rotation-aware
     * refetch) so we don't hit the provider on every sign-in.
     */
    private function verifyIdToken(string $jwt, string $jwksUrl, array $issuers, ?string $audience): array
    {
        if (! $audience) {
            // Missing config would make `aud` effectively unchecked — refuse
            // rather than accept a token minted for any other app.
            Log::error('Social login attempted without a configured audience', ['jwks' => $jwksUrl]);
            abort(503, __('Social login is not configured'));
        }

        // `JWT::$leeway` is a process-global static shared with the app's own
        // token validation (JwtService::decode). Set it only for this decode and
        // restore it afterwards so a social login can't loosen access-token
        // expiry checks for the rest of the request (or forever under Octane).
        $previousLeeway = JWT::$leeway;
        JWT::$leeway = 60; // tolerate small clock skew

        try {
            $cacheKey = 'social:jwks:'.md5($jwksUrl);
            $jwks = Cache::remember($cacheKey, now()->addHours(6), fn () => $this->fetchJwks($jwksUrl));

            $decode = fn (array $set): array => (array) JWT::decode($jwt, JWK::parseKeySet($set));

            try {
                $payload = $decode($jwks);
            } catch (ExpiredException|BeforeValidException|SignatureInvalidException $e) {
                // The token itself is bad (expired, not-yet-valid, or a forged
                // signature against a known key). Refetching won't help, so fail
                // fast — this stops a flood of invalid tokens from hammering the
                // provider's JWKS endpoint on every request.
                abort(401, __('Invalid identity token'));
            } catch (\UnexpectedValueException $e) {
                // A plain UnexpectedValueException here means the token's `kid`
                // isn't in our cached key set — the signing key likely rotated.
                // Refetch once and retry before giving up.
                try {
                    $jwks = $this->fetchJwks($jwksUrl);
                    Cache::put($cacheKey, $jwks, now()->addHours(6));
                    $payload = $decode($jwks);
                } catch (\Throwable $e2) {
                    abort(401, __('Invalid identity token'));
                }
            } catch (\Throwable $e) {
                // Malformed token / any other decode failure.
                abort(401, __('Invalid identity token'));
            }

            if (! in_array($payload['iss'] ?? '', $issuers, true)) {
                abort(401, __('Invalid identity token'));
            }

            // `aud` is a string, but the spec allows an array of audiences.
            $aud = $payload['aud'] ?? null;
            $audMatches = is_array($aud) ? in_array($audience, $aud, true) : $aud === $audience;
            if (! $audMatches) {
                abort(401, __('Invalid identity token'));
            }

            return $payload;
        } finally {
            JWT::$leeway = $previousLeeway;
        }
    }

    /** Fetch a provider JWKS document, aborting 503 if the provider is down. */
    private function fetchJwks(string $url): array
    {
        try {
            // With retries configured, a persistently failing response is thrown
            // as a RequestException (and a dead connection as ConnectionException)
            // after the attempts are exhausted — translate both to a clean 503.
            $res = Http::timeout(5)->retry(2, 200)->get($url);
        } catch (RequestException|ConnectionException $e) {
            abort(503, __('Identity provider unavailable'));
        }
        abort_unless($res->successful(), 503, __('Identity provider unavailable'));

        return $res->json();
    }

    /**
     * If the account is disabled because the owner requested deletion, signing
     * back in during the grace period cancels the deletion and re-enables the
     * account. Any other disabled account (e.g. an admin ban) stays 403.
     * Returns true when a pending deletion was cancelled.
     *
     * NOTE for manual bans (there is no HTTP ban endpoint — bans are shell/DB
     * ops): banning a user who has a deletion pending must also NULL
     * `deletion_requested_at`, otherwise this reactivation path would undo
     * the ban on their next login.
     */
    private function reactivateOrRejectDisabled(User $user, string $method): bool
    {
        if ($user->is_active) {
            return false;
        }

        if ($user->deletion_requested_at === null) {
            abort(403, __('Account is disabled'));
        }

        // False only if the account was purged (or changed) meanwhile.
        if (! $user->cancelPendingDeletion($method)) {
            abort(401, __('This account has been deleted'));
        }

        return true;
    }

    /**
     * Resolve a verified social identity to a user: reuse the linked account,
     * link to an existing account when the provider vouches for a matching
     * (verified) email, or create a fresh one. Never links on an unverified
     * email — that is the account-takeover guard.
     *
     * @return array{0: User, 1: bool} the user and whether a pending deletion was cancelled
     */
    private function loginSocialUser(string $provider, string $providerId, ?string $email, bool $emailVerified, ?string $name): array
    {
        // Every other entry point is ASCII-only (the `ascii` rule): production
        // MySQL compares emails accent-insensitively, so `bob@exämple.com`
        // would match `bob@example.com`. Never link or claim with such an
        // address — the account gets the no-reply placeholder instead.
        if ($email !== null && preg_match('/[^\x21-\x7E]/', $email)) {
            $email = null;
        }

        // 1) Known provider identity → that user. If the provider vouches for
        //    the exact stored address, that proves inbox ownership too.
        $user = User::where('provider', $provider)->where('provider_id', $providerId)->first();
        if ($user && ! $user->email_verified_at && $email && $emailVerified
            && strtolower($user->email) === strtolower($email)) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        // 2) A provider-verified email that matches an existing account links to
        //    it. Verified is essential — it proves the provider confirmed
        //    ownership, so a caller can't seize someone else's account by merely
        //    asserting their address.
        if (! $user && $email && $emailVerified) {
            $existing = User::where('email', $email)->first();
            // Byte-exact backstop on top of the collation-dependent lookup.
            if ($existing && strtolower($existing->email) !== strtolower($email)) {
                $existing = null;
            }
            if ($existing) {
                if ($existing->provider === $provider && $existing->provider_id !== $providerId) {
                    // Already bound to a *different* identity from this provider.
                    abort(409, __('This email is linked to a different account'));
                }
                // Authorize before mutating: a disabled account must not have its
                // password nulled and sessions revoked as a side effect of a
                // sign-in it isn't allowed to complete. (A pending self-deletion
                // is reactivated further down, after the link succeeds.)
                if (! $existing->is_active && $existing->deletion_requested_at === null) {
                    abort(403, __('Account is disabled'));
                }
                // Linking kills any existing password on the account. Signup never
                // verifies email ownership, so a matching password row may have
                // been created by someone who does NOT control this inbox (account
                // pre-hijack). The provider has now proven ownership, so it wins
                // the account: we null the password and revoke every credential
                // issued so far — refresh tokens, live access tokens and push
                // devices — evicting a pre-registrant who still holds a password
                // or session. A legitimate password owner simply resets.
                // An account that never proved its email also loses the access
                // it handed out (co-owners, invites, share links): the
                // pre-registrant may have planted it.
                $neverVerified = $existing->email_verified_at === null;
                DB::transaction(function () use ($existing, $provider, $providerId, $neverVerified) {
                    $existing->forceFill([
                        'provider' => $provider,
                        'provider_id' => $providerId,
                        'hashed_password' => null,
                        'email_verified_at' => $existing->email_verified_at ?? now(),
                    ])->save();
                    $existing->revokeAllSessions();
                    if ($neverVerified) {
                        $existing->revokeDelegatedAccess();
                    }
                });
                $user = $existing;
            }
        }

        // 3) New account. Use the provider email only when it's verified and
        //    free; otherwise a stable no-reply placeholder keeps the unique
        //    email constraint intact (Apple can withhold email on repeat
        //    sign-ins — but those hit branch 1, never here).
        if (! $user) {
            $useEmail = $email && $emailVerified && ! User::where('email', $email)->exists();
            try {
                $created = new User([
                    'name' => $name ?: 'PawPaw friend',
                    'email' => $useEmail ? $email : $provider.'_'.$providerId.'@users.noreply.pawpawcare.app',
                    'hashed_password' => null,
                    'provider' => $provider,
                    'provider_id' => $providerId,
                    // Explicit so the fresh model carries it in memory — the DB
                    // default only applies on reload, so the disabled-account check
                    // below would otherwise see null and 403 every new sign-in.
                    'is_active' => true,
                ]);
                $created->locale = User::requestLocale();
                $created->save();
                if ($useEmail) {
                    // The provider vouched for this address.
                    $created->forceFill(['email_verified_at' => now()])->save();
                }

                return [$created, false];
            } catch (UniqueConstraintViolationException $e) {
                // A concurrent first sign-in for the same identity won the race
                // and inserted the row between our lookup and insert. Resolve to
                // that row instead of surfacing a 500.
                $user = User::where('provider', $provider)->where('provider_id', $providerId)->first();
                if (! $user) {
                    throw $e; // collision was on something else (e.g. email) — genuine
                }
            }
        }

        // Existing account (linked or matched): honour the disabled flag,
        // cancelling a pending self-deletion (grace-period reactivation).
        $reactivated = $this->reactivateOrRejectDisabled($user, $provider);

        return [$user, $reactivated];
    }

    private static function loginFailKey(string $email): string
    {
        return 'login-fail|'.sha1(strtolower(trim($email)));
    }

    /** The networks an email's account signed in from (or reset its password from) recently. */
    private static function loginKnownKey(string $email): string
    {
        return 'login-known|'.sha1(strtolower(trim($email)));
    }

    /**
     * What the known networks are bound to: the account and its current
     * password. A reset, a Google/Apple link (which drops the password) or a
     * new account under the same email starts the list over, so whoever held
     * the old password, or squatted the email, keeps no budget of their own.
     */
    private static function credentialDigest(User $user): string
    {
        return hash_hmac('sha256', $user->id.'|'.$user->hashed_password, (string) config('app.key'));
    }

    /** Whether $email's account, with its current password, signed in from $network recently. */
    public static function isKnownNetwork(string $email, string $network): bool
    {
        $known = Cache::get(self::loginKnownKey($email));
        $seen = is_array($known) ? ($known['networks'][$network] ?? null) : null;
        if ($seen === null || $seen < now()->subDays(self::LOGIN_KNOWN_NETWORK_DAYS)->timestamp) {
            return false;
        }
        $user = User::where('email', $email)->first();

        return $user !== null && hash_equals((string) ($known['credential'] ?? ''), self::credentialDigest($user));
    }

    /** Drop every network remembered for $email (account purge). */
    public static function forgetKnownNetworks(string $email): void
    {
        Cache::forget(self::loginKnownKey($email));
    }

    /** Add $network to the account's known networks, keeping only the most recent few. */
    private static function rememberNetwork(User $user, string $network): void
    {
        $key = self::loginKnownKey($user->email);
        $digest = self::credentialDigest($user);
        $known = Cache::get($key);
        $networks = is_array($known) && hash_equals((string) ($known['credential'] ?? ''), $digest)
            ? $known['networks']
            : [];
        unset($networks[$network]);
        $networks[$network] = now()->timestamp;
        Cache::put($key, [
            'credential' => $digest,
            'networks' => array_slice($networks, -self::LOGIN_KNOWN_NETWORKS, null, true),
        ], now()->addDays(self::LOGIN_KNOWN_NETWORK_DAYS));
    }

    /** Mint an access + refresh token pair and persist the refresh token. */
    private function issueTokens(User $user): array
    {
        $access = JwtService::createAccessToken($user->id, (int) $user->token_version);
        [$refresh, $expiresAt] = JwtService::createRefreshToken($user->id, (int) $user->token_version);

        RefreshToken::create([
            'user_id' => $user->id,
            'token' => $refresh,
            'expires_at' => $expiresAt,
            'revoked' => false,
        ]);

        return [
            'access_token' => $access,
            'refresh_token' => $refresh,
            'token_type' => 'bearer',
        ];
    }
}
