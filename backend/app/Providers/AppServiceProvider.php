<?php

namespace App\Providers;

use App\Services\Extraction\AnthropicDriver;
use App\Services\Extraction\ExtractionClient;
use App\Services\Extraction\OpenAiCompatibleDriver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // AI document intake: which vision LLM reads vault documents.
        // `anthropic` (default) or `openai-compatible` (Qwen, Kimi, OpenRouter…).
        $this->app->bind(ExtractionClient::class, fn () => match (config('services.extraction.provider')) {
            'openai-compatible' => new OpenAiCompatibleDriver,
            default => new AnthropicDriver,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Forgot-password: capped per target email AND per source IP as two
        // independent limits — a rotating-IP attacker still can't mail-bomb
        // one address (or keep invalidating a victim's fresh codes), and one
        // host still can't probe many addresses.
        RateLimiter::for('forgot-password', function (Request $request) {
            $email = strtolower((string) $request->input('email'));

            return [
                Limit::perHour(5)->by('forgot-email|'.$email),
                Limit::perHour(5)->by('forgot-ip|'.$request->ip()),
            ];
        });

        // Reset attempts: capped per IP *and* per target email so 6-digit
        // code brute-forcing can't be spread across rotating source IPs.
        RateLimiter::for('password-reset', function (Request $request) {
            $email = strtolower((string) $request->input('email'));

            return [
                Limit::perHour(10)->by('reset-ip|'.$request->ip()),
                Limit::perHour(10)->by('reset-email|'.$email),
            ];
        });

        // Support inbox: 5/hour per authenticated user.
        RateLimiter::for('support', function (Request $request) {
            return Limit::perHour(5)->by('support|'.($request->user()?->id ?? $request->ip()));
        });
    }
}
