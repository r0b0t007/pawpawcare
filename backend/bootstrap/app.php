<?php

use App\Exceptions\UpgradeRequired;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\JwtAuth;
use App\Http\Middleware\SetLocale;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
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

        // Language of API messages (see SetLocale). Two registrations, by
        // design:
        //  1. Global: runs before routing on every request, so public routes
        //     (auth, password reset, signed pages), unknown-route 404s and
        //     JwtAuth's own 401s follow the Accept-Language header.
        //  2. The 'api' group, which every route in routes/api.php is in: runs
        //     again inside the route pipeline, where Laravel re-sorts route
        //     middleware by its priority list. The third line pins SetLocale
        //     right after AuthenticatesRequests (JwtAuth) in that list, so the
        //     sorted order is JwtAuth > SetLocale > ThrottleRequests >
        //     SubstituteBindings: $request->user() is resolved when SetLocale
        //     runs, so a user's saved locale beats the header, and 429s and
        //     model-binding 404s already use it. Without the priority pin,
        //     sorting would leave SetLocale last, after the throttles and
        //     bindings. LocaleTest guards this order.
        $middleware->append(SetLocale::class);
        $middleware->appendToGroup('api', SetLocale::class);
        $middleware->appendToPriorityList(AuthenticatesRequests::class, SetLocale::class);
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
                $msg = collect($e->errors())->flatten()->first() ?? __('Validation error');

                return response()->json(['detail' => $msg], 422);
            }
            if ($e instanceof ThrottleRequestsException) {
                // The framework's fixed "Too Many Attempts.", which never
                // passes through __() on its own.
                return response()->json(['detail' => __($e->getMessage())], $e->getStatusCode());
            }
            if ($e instanceof HttpExceptionInterface) {
                return response()->json(
                    ['detail' => $e->getMessage() ?: __('Error')],
                    $e->getStatusCode(),
                );
            }

            return null; // fall through to the default handler (still JSON)
        });
    })->create();
