<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for /admin/* routes. Runs after auth.jwt, so $request->user() is the
 * JWT-resolved user; anyone without the is_admin flag gets a flat 403.
 */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->is_admin) {
            return response()->json(['detail' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
