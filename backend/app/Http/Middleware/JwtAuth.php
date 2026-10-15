<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\JwtService;
use Closure;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Http\Request;
use Sentry\State\Scope;
use Symfony\Component\HttpFoundation\Response;

/**
 * Implements AuthenticatesRequests (a marker interface) so Laravel's
 * middleware priority list sorts this ahead of ThrottleRequests. Without it,
 * throttling ran first with $request->user() still null, and every limit on
 * an authenticated route keyed by IP instead of by user — `throttle:api`, the
 * numeric throttles and the named limiters alike. Behind carrier CGNAT,
 * thousands of users share one egress IP and would 429 each other.
 * RateLimitScopeTest guards this.
 *
 * Accepted trade-off: a request rejected here with 401 consumes no throttle
 * budget. A forged token costs one HMAC check. A genuinely signed but revoked
 * or deactivated token (≤ 60 min until it expires) costs one primary-key
 * lookup, the same as the first step of any authenticated request. A per-IP
 * cap on 401s was tried and dropped: a junk token could spend it and lock
 * out everyone else on a shared carrier IP.
 */
class JwtAuth implements AuthenticatesRequests
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = (string) $request->header('Authorization', '');

        if (! str_starts_with($header, 'Bearer ')) {
            return response()->json(['detail' => 'Invalid or expired access token'], 401);
        }

        $payload = JwtService::decode(substr($header, 7));

        if (! $payload || ($payload['type'] ?? null) !== 'access') {
            return response()->json(['detail' => 'Invalid or expired access token'], 401);
        }

        $user = User::where('id', $payload['sub'] ?? '')
            ->where('is_active', true)
            ->first();

        if (! $user) {
            return response()->json(['detail' => 'User not found'], 401);
        }

        // Revoked by User::revokeAllSessions() (password reset, social-link
        // takeover). Tokens minted before `ver` existed count as version 0.
        if ((int) ($payload['ver'] ?? 0) !== (int) $user->token_version) {
            return response()->json(['detail' => 'Invalid or expired access token'], 401);
        }

        $request->setUserResolver(fn () => $user);

        // No auth guard runs (and no Authenticated event fires), so Sentry
        // can't pick the user up automatically. Attach the pseudonymous id
        // only (never email/name).
        \Sentry\configureScope(fn (Scope $scope) => $scope->setUser(['id' => (string) $user->id]));

        return $next($request);
    }
}
