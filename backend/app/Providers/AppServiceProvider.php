<?php

namespace App\Providers;

use App\Services\Analytics\ProductAnalytics;
use App\Services\Extraction\AnthropicDriver;
use App\Services\Extraction\ExtractionClient;
use App\Services\Extraction\OpenAiCompatibleDriver;
use App\Services\JwtService;
use App\Support\Backups;
use App\Support\MailDelivery;
use App\Support\ReportOnce;
use App\Support\UploadsBackup;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Http\Request;
use Illuminate\Mail\Events\MessageSending;
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
        // Only then are the R2 upload buckets copied in (UploadsBackup),
        // unless the run was started with --only-db.
        Event::listen(CommandStarting::class, [UploadsBackup::class, 'noteCommand']);
        Event::listen(BackupManifestWasCreated::class, function (BackupManifestWasCreated $e) {
            Backups::assertEncryptable();
            UploadsBackup::addToManifest($e->manifest);
        });

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

        // An email about to vanish (log mailer, SMTP at 127.0.0.1, placeholder
        // From) becomes an error log in production, once per 10 minutes per
        // cause, so Sentry flags it the first time a user asks for a code.
        Event::listen(MessageSending::class, function (MessageSending $event) {
            if (! $this->app->isProduction()) {
                return;
            }
            if ($problem = MailDelivery::problem($event->data['mailer'] ?? null)) {
                ReportOnce::log('mail-delivery:'.md5($problem), 'error', "Email not delivered: {$problem}");
            }
        });

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
            return Limit::perMinute(20)->by('login-ip|'.self::network($request));
        });

        // Token refresh (CHW-184): a per-IP cap would make every app behind
        // one carrier NAT address share 20 refreshes a minute (each user
        // refreshes about hourly). So a genuine refresh token — its signature
        // checked first, which is cheap (HS256) — gets its own small bucket,
        // keyed by its jti. Anything else shares ONE small bucket per network:
        // keying made-up strings would let a client mint unlimited cache
        // entries, which the file cache never cleans up. The per-network
        // ceiling bounds the total, generous enough for a large CGNAT pool.
        RateLimiter::for('refresh', function (Request $request) {
            $token = $request->input('refresh_token');
            $payload = is_string($token) && strlen($token) <= 512 ? JwtService::decode($token) : null;
            $genuine = ($payload['type'] ?? null) === 'refresh' && is_string($payload['jti'] ?? null);

            return [
                $genuine
                    ? Limit::perMinute(10)->by('refresh-token|'.$payload['jti'])
                    : Limit::perMinute(20)->by('refresh-bad|'.self::network($request)),
                Limit::perMinute(600)->by('refresh-net|'.self::network($request)),
            ];
        });

        // Costly authenticated routes (CHW-185): each keeps its per-user
        // budget, plus a per-network ceiling so one person with many free
        // accounts can't multiply it. The ceilings sit well above what a
        // carrier-NAT pool of real users sends.
        RateLimiter::for('doc-extract', function (Request $request) {
            return [
                Limit::perMinute(10)->by('doc-extract|'.($request->user()?->id ?? $request->ip())),
                Limit::perMinute(60)->by('doc-extract-net|'.self::network($request)),
            ];
        });
        RateLimiter::for('invite', function (Request $request) {
            return [
                Limit::perMinute(20)->by('invite|'.($request->user()?->id ?? $request->ip())),
                Limit::perMinute(60)->by('invite-net|'.self::network($request)),
            ];
        });

        // Support inbox: 5/hour per authenticated user, with feedback and ideas
        // counted separately so casual notes never use up the budget for a
        // real problem or question.
        RateLimiter::for('support', function (Request $request) {
            $bucket = in_array($request->input('category'), ['feedback', 'idea'], true) ? 'feedback' : 'help';

            return Limit::perHour(5)->by("support|{$bucket}|".($request->user()?->id ?? $request->ip()));
        });

        // Records export: PDF rendering is the priciest request in the app,
        // and no legitimate user re-exports their history 10+ times an hour.
        RateLimiter::for('records-export', function (Request $request) {
            return Limit::perHour(10)
                ->by('export|'.($request->user()?->id ?? $request->ip()))
                // The app surfaces this `detail` verbatim in the export sheet,
                // so say something friendlier than "Too Many Attempts."
                ->response(fn () => response()->json(
                    ['detail' => __('Too many exports — please try again in an hour.')], 429
                ));
        });

        // Post reporting: capped per user so one account can't mass-flag the
        // feed (three distinct reporters hide a post for everyone else).
        RateLimiter::for('post-report', function (Request $request) {
            return [
                Limit::perHour(10)->by('post-report|'.($request->user()?->id ?? $request->ip())),
                Limit::perHour(50)->by('post-report-net|'.self::network($request)),
            ];
        });
    }

    /**
     * The caller's network for per-IP limits: the IPv4 address, or the /64
     * of an IPv6 one — a single IPv6 subscriber holds a whole /64, so keying
     * on the full address would hand them 2^64 separate budgets.
     */
    public static function network(Request $request): string
    {
        $ip = (string) $request->ip();
        // IPv4-mapped (::ffff:a.b.c.d, from some dual-stack sockets) is
        // plain IPv4 — its /64 would lump every IPv4 client together.
        if (str_starts_with(strtolower($ip), '::ffff:') && filter_var(substr($ip, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return substr($ip, 7);
        }
        if (str_contains($ip, ':') && ($bin = @inet_pton($ip)) !== false) {
            return inet_ntop(substr($bin, 0, 8).str_repeat("\0", 8));
        }

        return $ip;
    }
}
