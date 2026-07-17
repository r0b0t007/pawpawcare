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
        // Blanket ceiling for every authenticated route (applied to the
        // auth.jwt group in routes/api.php). Generous enough that no real
        // client ever hits it — it exists so a leaked/abused token can't
        // hammer unthrottled writes without limit. Tighter per-route
        // limiters stack on top of this one.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by('api|'.($request->user()?->id ?? $request->ip()));
        });

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

        // Records export: PDF rendering is the priciest request in the app,
        // and no legitimate user re-exports their history 10+ times an hour.
        RateLimiter::for('records-export', function (Request $request) {
            return Limit::perHour(10)
                ->by('export|'.($request->user()?->id ?? $request->ip()))
                // The app surfaces this `detail` verbatim in the export sheet,
                // so say something friendlier than "Too Many Attempts."
                ->response(fn () => response()->json(
                    ['detail' => 'Too many exports — please try again in an hour.'], 429
                ));
        });

        // Post reporting: capped per user so one account can't mass-flag the
        // feed (three distinct reporters hide a post for everyone else).
        RateLimiter::for('post-report', function (Request $request) {
            return Limit::perHour(10)->by('post-report|'.($request->user()?->id ?? $request->ip()));
        });
    }
}
