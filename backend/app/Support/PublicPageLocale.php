<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Str;

/**
 * The language of the public, signed-URL pages (vet share page, caretaker
 * page). Nobody is signed in when they open, so SetLocale can't use a saved
 * preference; instead the language travels in the link itself.
 *
 *  - At mint time (an authenticated request, so SetLocale already ran) the
 *    creator's language is written into the URL as `lang` BEFORE signing:
 *    the signature covers it, so it can't be swapped without a 403.
 *  - English links carry no `lang` at all, exactly like every link minted
 *    before this existed — those are live in production and keep rendering
 *    English.
 *  - The share page also honours `hl`, a viewer-chosen display language that
 *    the route's `signed` middleware explicitly ignores (a vet may not read
 *    the owner's language). It is validated against User::LOCALES and only
 *    ever feeds App::setLocale: it cannot change which pet or records show.
 */
final class PublicPageLocale
{
    /** Signed: the link creator's language. */
    public const PARAM = 'lang';

    /** Unsigned: a viewer's display-language override (share page only). */
    public const DISPLAY_PARAM = 'hl';

    /** Each language in its own name — the switch shows these, untranslated. */
    public const NAMES = ['en' => 'English', 'fr' => 'Français', 'es' => 'Español'];

    /**
     * Route parameters to sign into a new link: the current request's
     * language, or nothing for English (so English links stay unchanged).
     *
     * @return array<string, string>
     */
    public static function linkParams(): array
    {
        $locale = User::requestLocale();

        return $locale === User::LOCALES[0] ? [] : [self::PARAM => $locale];
    }

    /**
     * Pick this page's language and apply it to the request: the viewer's
     * `hl` override when allowed and valid, else the signed `lang`, else
     * English (old links, or any value outside User::LOCALES).
     */
    public static function apply(Request $request, bool $allowDisplayOverride = false): string
    {
        $locale = ($allowDisplayOverride ? self::valid($request->query(self::DISPLAY_PARAM)) : null)
            ?? self::valid($request->query(self::PARAM))
            ?? User::LOCALES[0];

        App::setLocale($locale);

        return $locale;
    }

    /**
     * Relative links (query string only) to this same page in each language.
     * Built from the raw query string so the signed part is carried over
     * byte for byte; any existing `hl` is dropped and the new one appended.
     *
     * @return array<string, string> locale => href
     */
    public static function switchLinks(Request $request): array
    {
        $kept = collect(explode('&', (string) $request->server->get('QUERY_STRING')))
            ->reject(fn (string $part) => $part === '' || Str::before($part, '=') === self::DISPLAY_PARAM)
            ->implode('&');

        $links = [];
        foreach (User::LOCALES as $locale) {
            $links[$locale] = '?'.($kept === '' ? '' : $kept.'&').self::DISPLAY_PARAM.'='.$locale;
        }

        return $links;
    }

    /** A date in the current language, using the isoFormat stored at $formatKey. */
    public static function date(?CarbonInterface $date, string $formatKey): string
    {
        return $date ? $date->copy()->locale(App::getLocale())->isoFormat(__($formatKey)) : '';
    }

    /**
     * A link-expiry timestamp: the localized date/time plus the timezone
     * abbreviation, same timezone handling as the old format('… T').
     */
    public static function expiry(CarbonInterface $at, string $formatKey): string
    {
        return self::date($at, $formatKey).' '.$at->format('T');
    }

    /**
     * Label for a fixed app value (pet type, gender, medication frequency,
     * document category) from `share.<group>.<value>`; anything else —
     * free text the owner typed — is shown as-is via $fallback.
     */
    public static function label(string $group, mixed $value, string $fallback): string
    {
        return self::lookup("share.{$group}", $value) ?? $fallback;
    }

    /**
     * The translation of a stored id under $prefix, or null. Only a plain id
     * is looked up: a co-owner's free-text value with dots or '::' must never
     * steer the lang key.
     */
    public static function lookup(string $prefix, mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^[a-z_]{1,40}\z/', $value)) {
            return null;
        }

        $key = "{$prefix}.{$value}";
        $translated = Lang::has($key) ? __($key) : null;

        return is_string($translated) ? $translated : null;
    }

    /**
     * A stored decimal (e.g. 4.8) with the current language's decimal mark.
     * Uses trans() on purpose: LocaleTest treats every single-argument
     * double-underscore call in app/ as a lang/*.json key, and this key lives
     * in the lang/{locale}/weight.php group instead.
     */
    public static function decimal(mixed $value): string
    {
        return str_replace('.', trans('weight.decimal_point'), (string) $value);
    }

    private static function valid(mixed $value): ?string
    {
        return is_string($value) && in_array($value, User::LOCALES, true) ? $value : null;
    }
}
