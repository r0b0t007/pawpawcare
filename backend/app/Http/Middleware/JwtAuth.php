<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\JwtService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class JwtAuth
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

        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
