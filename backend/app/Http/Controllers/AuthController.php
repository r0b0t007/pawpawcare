<?php

namespace App\Http\Controllers;

use App\Models\RefreshToken;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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
