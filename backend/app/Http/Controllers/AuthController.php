<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetCodeMail;
use App\Models\PasswordResetCode;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\JwtService;
use Firebase\JWT\BeforeValidException;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\SignatureInvalidException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AuthController extends Controller
{
    public function signup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|min:1|max:100',
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:6',
        ]);

        if (User::where('email', $data['email'])->exists()) {
            abort(409, 'Email already registered');
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'hashed_password' => Hash::make($data['password']),
        ]);

        return response()->json($this->issueTokens($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->hashed_password)) {
            abort(401, 'Invalid email or password');
        }

        if (! $user->is_active) {
            abort(403, 'Account is disabled');
        }

        return response()->json($this->issueTokens($user));
    }

    /**
     * Sign in with Google. The client sends the Google-issued ID token (from
     * @react-native-google-signin, configured with our Web client ID). We verify
     * it against Google's public keys — never trusting any claim until the
     * signature, issuer and audience check out — then find/link/create the user.
     */
    public function google(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id_token' => 'required|string',
        ]);

        $payload = $this->verifyIdToken(
            $data['id_token'],
            'https://www.googleapis.com/oauth2/v3/certs',
            ['accounts.google.com', 'https://accounts.google.com'],
            config('services.google.client_id'),
        );

        $user = $this->loginSocialUser(
            'google',
            (string) $payload['sub'],
            $payload['email'] ?? null,
            filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            $payload['name'] ?? null,
        );

        return response()->json($this->issueTokens($user));
    }

    /**
     * Sign in with Apple. The client sends the identity token from the native
     * Sign in with Apple flow (iOS only). We verify it against Apple's public
     * keys plus the nonce the app committed to, guarding against replay.
     */
    public function apple(Request $request): JsonResponse
    {
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
            abort(401, 'Invalid identity token');
        }

        $user = $this->loginSocialUser(
            'apple',
            (string) $payload['sub'],
            $payload['email'] ?? null,
            // Apple only ever returns emails it has already verified.
            filter_var($payload['email_verified'] ?? true, FILTER_VALIDATE_BOOLEAN),
            $data['full_name'] ?? null,
        );

        return response()->json($this->issueTokens($user));
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => 'required|string',
        ]);

        $payload = JwtService::decode($data['refresh_token']);

        if (! $payload || ($payload['type'] ?? null) !== 'refresh') {
            abort(401, 'Invalid refresh token');
        }

        $stored = RefreshToken::where('token', $data['refresh_token'])
            ->where('revoked', false)
            ->first();

        if (! $stored || $stored->expires_at->isPast()) {
            abort(401, 'Refresh token expired or revoked');
        }

        $stored->update(['revoked' => true]);

        $userId = $payload['sub'];
        $user = User::find($userId);

        if (! $user) {
            abort(401, 'Invalid refresh token');
        }

        return response()->json($this->issueTokens($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => 'required|string',
        ]);

        RefreshToken::where('token', $data['refresh_token'])
            ->update(['revoked' => true]);

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
            'email' => 'required|email|max:255',
        ]);

        $user = User::where('email', $data['email'])->where('is_active', true)->first();

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
            dispatch(function () use ($email, $code) {
                try {
                    Mail::to($email)->send(new PasswordResetCodeMail($code));
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
            'email' => 'required|email|max:255',
            'code' => 'required|string|max:10',
            'password' => 'required|string|min:8',
        ]);

        // One generic message for every failure mode — wrong email, wrong
        // code, expired or already used — so responses reveal nothing.
        $user = User::where('email', $data['email'])->where('is_active', true)->first();

        $record = $user
            ? PasswordResetCode::where('user_id', $user->id)
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->latest('created_at')
                ->first()
            : null;

        if (! $record || ! Hash::check($data['code'], $record->code_hash)) {
            if ($record) {
                // Per-code attempt cap: five wrong guesses burn the code, so
                // brute-forcing the 6-digit space can't be done by IP rotation.
                // Increment and burn are both DB-side conditionals so parallel
                // guesses can't each read a stale count and slip past the cap.
                $record->increment('attempts');
                PasswordResetCode::where('id', $record->id)
                    ->where('attempts', '>=', 5)
                    ->whereNull('used_at')
                    ->update(['used_at' => now()]);
            }
            abort(400, 'Invalid or expired code');
        }

        $record->update(['used_at' => now()]);
        $user->update(['hashed_password' => Hash::make($data['password'])]);

        // Kill every existing session: a stolen refresh token must die with
        // the old password.
        RefreshToken::where('user_id', $user->id)->delete();

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
            abort(503, 'Social login is not configured');
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
                abort(401, 'Invalid identity token');
            } catch (\UnexpectedValueException $e) {
                // A plain UnexpectedValueException here means the token's `kid`
                // isn't in our cached key set — the signing key likely rotated.
                // Refetch once and retry before giving up.
                try {
                    $jwks = $this->fetchJwks($jwksUrl);
                    Cache::put($cacheKey, $jwks, now()->addHours(6));
                    $payload = $decode($jwks);
                } catch (\Throwable $e2) {
                    abort(401, 'Invalid identity token');
                }
            } catch (\Throwable $e) {
                // Malformed token / any other decode failure.
                abort(401, 'Invalid identity token');
            }

            if (! in_array($payload['iss'] ?? '', $issuers, true)) {
                abort(401, 'Invalid identity token');
            }

            // `aud` is a string, but the spec allows an array of audiences.
            $aud = $payload['aud'] ?? null;
            $audMatches = is_array($aud) ? in_array($audience, $aud, true) : $aud === $audience;
            if (! $audMatches) {
                abort(401, 'Invalid identity token');
            }

            return $payload;
        } finally {
            JWT::$leeway = $previousLeeway;
        }
    }

    /** Fetch a provider JWKS document, aborting 503 if the provider is down. */
    private function fetchJwks(string $url): array
    {
        $res = Http::timeout(5)->retry(2, 200)->get($url);
        abort_unless($res->successful(), 503, 'Identity provider unavailable');

        return $res->json();
    }

    /**
     * Resolve a verified social identity to a user: reuse the linked account,
     * link to an existing account when the provider vouches for a matching
     * (verified) email, or create a fresh one. Never links on an unverified
     * email — that is the account-takeover guard.
     */
    private function loginSocialUser(string $provider, string $providerId, ?string $email, bool $emailVerified, ?string $name): User
    {
        // 1) Known provider identity → that user.
        $user = User::where('provider', $provider)->where('provider_id', $providerId)->first();

        // 2) A provider-verified email that matches an existing account links to
        //    it. Verified is essential — it proves the provider confirmed
        //    ownership, so a caller can't seize someone else's account by merely
        //    asserting their address.
        if (! $user && $email && $emailVerified) {
            $existing = User::where('email', $email)->first();
            if ($existing) {
                if ($existing->provider === $provider && $existing->provider_id !== $providerId) {
                    // Already bound to a *different* identity from this provider.
                    abort(409, 'This email is linked to a different account');
                }
                // Authorize before mutating: a disabled account must not have its
                // password nulled and sessions revoked as a side effect of a
                // sign-in it isn't allowed to complete.
                if (! $existing->is_active) {
                    abort(403, 'Account is disabled');
                }
                // Linking kills any existing password on the account. Signup never
                // verifies email ownership, so a matching password row may have
                // been created by someone who does NOT control this inbox (account
                // pre-hijack). The provider has now proven ownership, so it wins
                // the account: we null the password and revoke every existing
                // refresh token, evicting a pre-registrant who still holds a
                // password or session. A legitimate password owner simply resets.
                $existing->forceFill([
                    'provider' => $provider,
                    'provider_id' => $providerId,
                    'hashed_password' => null,
                ])->save();
                RefreshToken::where('user_id', $existing->id)->delete();
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
                return User::create([
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

        // Existing account (linked or matched): honour the disabled flag.
        if (! $user->is_active) {
            abort(403, 'Account is disabled');
        }

        return $user;
    }

    /** Mint an access + refresh token pair and persist the refresh token. */
    private function issueTokens(User $user): array
    {
        $access = JwtService::createAccessToken($user->id);
        [$refresh, $expiresAt] = JwtService::createRefreshToken($user->id);

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
