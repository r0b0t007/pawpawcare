<?php

namespace App\Http\Controllers;

use App\Mail\EmailVerificationCodeMail;
use App\Models\EmailVerificationCode;
use App\Services\Analytics\ProductAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Prove control of the account's email with an emailed 6-digit code. Signup
 * never verifies the address, so anything granted by email alone — pet
 * co-owner invites — waits for this (or for a completed password reset, or a
 * provider-verified social sign-in, which verify the address too).
 */
class EmailVerificationController extends Controller
{
    /** Social accounts without a usable provider email get this (AuthController). */
    private const PLACEHOLDER_DOMAIN = '@users.noreply.pawpawcare.app';

    /** Email a fresh code to the signed-in user's address. */
    public function send(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->hasVerifiedEmail()) {
            return response()->json(['status' => 'already_verified']);
        }
        if (str_ends_with(strtolower($user->email), self::PLACEHOLDER_DOMAIN)) {
            abort(422, __('This account has no email address to confirm.'));
        }

        // Per-user cap enforced here, not just by route middleware, so it
        // can't degrade to per-IP: each code buys five guesses, so unlimited
        // codes would make the 6-digit space brute-forceable.
        $key = 'email-verify-send|'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            abort(429, __('Too many codes requested — try again in an hour.'));
        }
        RateLimiter::hit($key, 3600);

        // A new request invalidates every earlier code.
        EmailVerificationCode::where('user_id', $user->id)->delete();

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        EmailVerificationCode::create([
            'user_id' => $user->id,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(30),
        ]);

        // After the response, like password reset: keeps SMTP latency out of
        // the request and the plaintext code out of any queue store.
        $email = $user->email;
        dispatch(function () use ($email, $code) {
            try {
                Mail::to($email)->send(new EmailVerificationCodeMail($code));
            } catch (\Throwable $e) {
                Log::error('Email verification email failed', ['error' => $e->getMessage()]);
            }
        })->afterResponse();

        return response()->json(['status' => 'sent']);
    }

    /** Check the emailed code and mark the address verified. */
    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => 'required|string|max:10',
        ]);
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json($user->toSelfApi());
        }

        $record = EmailVerificationCode::where('user_id', $user->id)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->latest('created_at')
            ->first();

        // Reserve the attempt BEFORE comparing (one conditional UPDATE), so
        // parallel guesses can't each read a stale count: at most five
        // comparisons ever run against one code.
        $reserved = $record
            ? EmailVerificationCode::where('id', $record->id)
                ->whereNull('used_at')
                ->where('attempts', '<', 5)
                ->increment('attempts')
            : 0;

        if ($reserved !== 1 || ! Hash::check($data['code'], $record->code_hash)) {
            abort(400, __('Invalid or expired code'));
        }

        // Single-use: only the request that marks it used verifies.
        $used = EmailVerificationCode::where('id', $record->id)->whereNull('used_at')->update(['used_at' => now()]);
        if ($used !== 1) {
            abort(400, __('Invalid or expired code'));
        }
        $user->forceFill(['email_verified_at' => now()])->save();

        app(ProductAnalytics::class)->capture($user, 'server_email_verified');

        return response()->json($user->toSelfApi());
    }
}
