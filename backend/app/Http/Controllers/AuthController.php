<?php

namespace App\Http\Controllers;

use App\Mail\PasswordResetCodeMail;
use App\Models\PasswordResetCode;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
