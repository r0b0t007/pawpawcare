<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Validation\ValidationException;
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
            'auth.jwt' => \App\Http\Middleware\JwtAuth::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The mobile/web client expects every error as JSON with a `detail` key
        // (preserving the previous FastAPI backend contract).
        $exceptions->shouldRenderJsonWhen(fn () => true);

        $exceptions->render(function (Throwable $e, $request) {
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
