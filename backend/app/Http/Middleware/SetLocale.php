<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Picks the language of this request's API messages (abort() details,
 * validation errors): the signed-in user's saved `locale` when a user has
 * been resolved, otherwise the best Accept-Language match among
 * User::LOCALES, otherwise English.
 *
 * Registered twice (bootstrap/app.php), because no single slot sees both
 * cases. As global middleware it runs before routing, so every response —
 * public routes, signed pages, 404s, and JwtAuth's own 401s — follows the
 * header. As 'api' group middleware, sorted right after JwtAuth, it runs
 * again once the user is known, so the saved preference wins over the header.
 */
class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        App::setLocale(self::resolve($request));

        return $next($request);
    }

    public static function resolve(Request $request): string
    {
        $saved = $request->user()?->locale;
        if (is_string($saved) && in_array($saved, User::LOCALES, true)) {
            return $saved;
        }

        return self::fromAcceptLanguage($request->header('Accept-Language')) ?? User::LOCALES[0];
    }

    /**
     * The highest-weighted supported language in an Accept-Language header,
     * matched on the primary subtag ('fr-FR', 'fr_CA' and 'FR' all mean
     * 'fr'); null when nothing in it is supported. Entries with q=0 are
     * explicit refusals and are skipped; ties keep header order.
     */
    public static function fromAcceptLanguage(?string $header): ?string
    {
        if ($header === null || trim($header) === '') {
            return null;
        }

        $candidates = [];
        foreach (explode(',', substr($header, 0, 512)) as $position => $part) {
            $pieces = array_map('trim', explode(';', $part));
            $tag = strtolower(str_replace('_', '-', array_shift($pieces)));
            if ($tag === '') {
                continue;
            }

            $q = 1.0;
            foreach ($pieces as $param) {
                if (preg_match('/^q\s*=\s*([01](?:\.\d{0,3})?)$/i', $param, $m)) {
                    $q = (float) $m[1];
                }
            }
            if ($q <= 0.0) {
                continue;
            }

            $primary = explode('-', $tag)[0];
            if (in_array($primary, User::LOCALES, true)) {
                $candidates[] = [$q, $position, $primary];
            }
        }

        if ($candidates === []) {
            return null;
        }

        usort($candidates, fn ($a, $b) => [$b[0], $a[1]] <=> [$a[0], $b[1]]);

        return $candidates[0][2];
    }
}
