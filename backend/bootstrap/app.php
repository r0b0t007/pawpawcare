<?php

use App\Exceptions\UpgradeRequired;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\JwtAuth;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Validation\ValidationException;
use Sentry\Laravel\Integration as SentryIntegration;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'auth.jwt' => JwtAuth::class,
            'admin' => EnsureAdmin::class,
        ]);

        // Laravel sorts every route's pipeline by the middleware priority list.
        // ThrottleRequests is on that list; JwtAuth, being a custom alias, is
        // not — so throttle was hoisted AHEAD of authentication and ran with
        // $request->user() still null. Every rate limit on an authenticated
        // route therefore keyed by IP instead of by user:
        //
        //   - `throttle:api` (120/min) across every authenticated route
        //   - the numeric throttles (uploads, invites, share links, AI extract,
        //     DELETE /users/me, community posts), which use Laravel's internal
        //     resolveRequestSignature() and so cannot be fixed in the limiter
        //   - the `support`, `records-export` and `post-report` limiters
        //
        // Real-world effect: everyone behind one public IP shared a single
        // budget. Mobile carriers use CGNAT, so thousands of users can share an
        // egress IP and 429 each other.
        //
        // The trade-off this accepts: authentication now runs first, so a
        // request rejected with 401 consumes no throttle budget. That is
        // deliberate. Rejecting a bad token costs one HMAC check and no
        // database work (the user lookup needs a token signed with our key),
        // so the exposure is the same as any unknown URL. A per-IP cap on 401s
        // was tried and dropped: anyone could spend it with a junk token and
        // lock out everyone else on a shared carrier IP.
        $middleware->prependToPriorityList(
            ThrottleRequests::class,
            JwtAuth::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Report unhandled exceptions to Sentry (inert without a DSN).
        SentryIntegration::handles($exceptions);

        // Laravel ignores every HttpException (any abort()) by default. 4xx are
        // expected business errors, but a deliberate abort(5xx) means something
        // server-side is broken (extraction provider down, social login or the
        // signing key misconfigured) — report those, throttled to one event per
        // distinct status+message per 10 minutes so a misconfiguration hit on
        // every request can't burn the Sentry quota.
        $exceptions->stopIgnoring(HttpException::class);
        $exceptions->dontReport([UpgradeRequired::class]);
        $exceptions->dontReportWhen(
            fn (Throwable $e) => $e instanceof HttpExceptionInterface && $e->getStatusCode() < 500,
        );
        $exceptions->throttle(fn (Throwable $e) => $e instanceof HttpExceptionInterface
            ? Limit::perMinutes(10, 1)->by('http5xx:'.$e->getStatusCode().':'.md5($e->getMessage()))
            : null);

        // The mobile/web client expects every error as JSON with a `detail` key
        // (preserving the previous FastAPI backend contract).
        $exceptions->shouldRenderJsonWhen(fn () => true);

        $exceptions->render(function (Throwable $e, $request) {
            if ($e instanceof UpgradeRequired) {
                return response()->json([
                    'detail' => $e->getMessage(),
                    'code' => 'upgrade_required',
                    'feature' => $e->feature,
                ], 402);
            }
            if ($e instanceof ValidationException) {
                $msg = collect($e->errors())->flatten()->first() ?? 'Validation error';

                return response()->json(['detail' => $msg], 422);
            }
            if ($e instanceof HttpExceptionInterface) {
                return response()->json(
                    ['detail' => $e->getMessage() ?: 'Error'],
                    $e->getStatusCode(),
                );
            }

            return null; // fall through to the default handler (still JSON)
        });
    })->create();
