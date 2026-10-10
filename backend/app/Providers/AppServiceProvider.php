<?php

namespace App\Providers;

use App\Services\Analytics\ProductAnalytics;
use App\Services\Extraction\AnthropicDriver;
use App\Services\Extraction\ExtractionClient;
use App\Services\Extraction\OpenAiCompatibleDriver;
use App\Support\Backups;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Spatie\Backup\Events\BackupHasFailed;
use Spatie\Backup\Events\BackupManifestWasCreated;
use Spatie\Backup\Events\CleanupHasFailed;
use Spatie\Backup\Events\UnhealthyBackupWasFound;

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

        // One buffer per request/command, flushed after the response is sent.
        $this->app->singleton(ProductAnalytics::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // spatie writes a plain zip when the password is empty or ext-zip has
        // no AES. This fires inside the backup job before zipping, so throwing
        // aborts the run (manual or scheduled) and raises BackupHasFailed.
        Event::listen(BackupManifestWasCreated::class, fn () => Backups::assertEncryptable());

        // Backups send no mail (config/backup.php): every failure is an error
        // log, which the sentry log channel turns into an alert.
        Event::listen(BackupHasFailed::class, fn (BackupHasFailed $e) => Log::error('Backup failed', [
            'disk' => $e->diskName,
            'error' => $e->exception->getMessage(),
        ]));
        Event::listen(CleanupHasFailed::class, fn (CleanupHasFailed $e) => Log::error('Backup cleanup failed', [
            'disk' => $e->diskName,
            'error' => $e->exception->getMessage(),
        ]));
        Event::listen(UnhealthyBackupWasFound::class, fn (UnhealthyBackupWasFound $e) => Log::error('Backups are unhealthy', [
            'disk' => $e->diskName,
            'problems' => $e->failureMessages->pluck('message')->filter()->values()->all(),
        ]));

        // Queue workers never reach app()->terminating between jobs: send any
        // analytics a job captured once it's done.
        Queue::after(function () {
            if ($this->app->resolved(ProductAnalytics::class)) {
                $this->app->make(ProductAnalytics::class)->flush();
            }
        });

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

        // Login, per source network. One IPv6 subscriber holds a whole /64, so
        // keying on the full address would hand them 2^64 separate budgets.
        // (The per-account failure budget lives in AuthController::login.)
        RateLimiter::for('login', function (Request $request) {
            $ip = (string) $request->ip();
            // IPv4-mapped (::ffff:a.b.c.d, from some dual-stack sockets) is
            // plain IPv4 — its /64 would lump every IPv4 client together.
            if (str_starts_with(strtolower($ip), '::ffff:') && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                $ip = substr($ip, 7);
            } elseif (str_contains($ip, ':') && ($bin = @inet_pton($ip)) !== false) {
                $ip = inet_ntop(substr($bin, 0, 8).str_repeat("\0", 8));
            }

            return Limit::perMinute(20)->by('login-ip|'.$ip);
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
