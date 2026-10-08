<?php

namespace App\Support;

use Sentry\Breadcrumb;
use Sentry\Event;
use Sentry\EventHint;
use Sentry\Stacktrace;
use Sentry\UserDataBag;

/**
 * Last line of defence keeping pet medical data and credentials out of
 * Sentry. Wired as `before_send` / `before_send_transaction` in
 * config/sentry.php (callable arrays: closures can't survive config:cache).
 *
 * Belt and braces with send_default_pii=false + max_request_body_size=never:
 *  - request: method + path only. Signed /documents/{id}/raw, /share/… and
 *    /care/… URLs carry a credential in the query string; bodies, cookies and
 *    headers can carry record content or tokens.
 *  - user: id only (a pseudonymous UUID).
 *  - every string we can reach — message, exception values, extra (incl. the
 *    log channel's `log_context`), contexts, tags, breadcrumb messages and
 *    data, span data — goes through scrubText(): database-error SQL (Laravel
 *    inlines bound values, e.g. a refresh token), raw JWTs, Bearer tokens,
 *    emails, query strings and signed-URL parameters are redacted.
 *  - stack frames: argument values (`vars`) are dropped entirely.
 */
class SentryScrubber
{
    /** Contexts the SDK fills with non-user data we want to keep intact. */
    private const SAFE_CONTEXTS = ['trace', 'os', 'runtime', 'device', 'app'];

    public static function beforeSend(Event $event, ?EventHint $hint = null): ?Event
    {
        return self::scrub($event);
    }

    public static function beforeSendTransaction(Event $event, ?EventHint $hint = null): ?Event
    {
        return self::scrub($event);
    }

    public static function scrub(Event $event): Event
    {
        $event->setRequest(self::scrubRequest($event->getRequest()));

        $user = $event->getUser();
        if ($user !== null) {
            $event->setUser($user->getId() !== null ? UserDataBag::createFromUserIdentifier($user->getId()) : null);
        }

        $message = $event->getMessage();
        if ($message !== null) {
            $event->setMessage(self::scrubText($message));
        }

        foreach ($event->getExceptions() as $exception) {
            $exception->setValue(self::scrubText($exception->getValue()));
            self::dropFrameVars($exception->getStacktrace());
        }
        self::dropFrameVars($event->getStacktrace());

        $event->setExtra(self::scrubValue($event->getExtra()));
        $event->setTags(self::scrubValue($event->getTags()));
        foreach ($event->getContexts() as $name => $data) {
            if (! in_array($name, self::SAFE_CONTEXTS, true) && is_array($data)) {
                $event->setContext($name, self::scrubValue($data));
            }
        }

        $event->setBreadcrumb(array_map(self::scrubBreadcrumb(...), $event->getBreadcrumbs()));

        foreach ($event->getSpans() as $span) {
            $data = self::scrubValue($span->getData());
            // Span::setData() merges, so blank (rather than remove) query parts.
            foreach (['http.query', 'http.fragment'] as $key) {
                if (array_key_exists($key, $data)) {
                    $data[$key] = '';
                }
            }
            $span->setData($data);

            // Descriptions hold cache keys, SQL (raw statements can inline
            // values) and outgoing URLs.
            $description = $span->getDescription();
            if ($description !== null) {
                $span->setDescription(self::scrubText($description));
            }
        }

        $transaction = $event->getTransaction();
        if ($transaction !== null) {
            $event->setTransaction(self::stripQuery($transaction));
        }

        return $event;
    }

    /**
     * @param  array<string, mixed>  $request
     * @return array<string, mixed>
     */
    public static function scrubRequest(array $request): array
    {
        if ($request === []) {
            return [];
        }

        $kept = [];
        if (isset($request['method'])) {
            $kept['method'] = $request['method'];
        }
        if (isset($request['url']) && is_string($request['url'])) {
            $kept['url'] = self::stripQuery($request['url']);
        }

        return $kept;
    }

    public static function scrubBreadcrumb(Breadcrumb $crumb): Breadcrumb
    {
        $message = $crumb->getMessage();
        if ($message !== null) {
            $crumb = $crumb->withMessage(self::scrubText($message));
        }

        foreach ($crumb->getMetadata() as $key => $value) {
            if (in_array($key, ['http.query', 'http.fragment', 'bindings'], true)) {
                $crumb = $crumb->withoutMetadata($key);
            } elseif ($key === 'url' && is_string($value)) {
                $crumb = $crumb->withMetadata('url', self::stripQuery($value));
            } else {
                // Log/command breadcrumbs carry the raw context/arguments.
                $crumb = $crumb->withMetadata((string) $key, self::scrubValue($value));
            }
        }

        return $crumb;
    }

    /** Recursively scrub strings inside arrays; other scalars pass through. */
    public static function scrubValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return self::scrubText($value);
        }
        if (is_array($value)) {
            return array_map(self::scrubValue(...), $value);
        }

        return $value;
    }

    public static function scrubText(string $text): string
    {
        // Database errors: Laravel appends "(Connection: …, SQL: <query with
        // bound values inlined>)" — those values can be refresh tokens, share
        // tokens, password hashes or medical notes. Keep the SQLSTATE part.
        $text = (string) preg_replace('/\s*\(Connection:.*?SQL:.*\)\s*$/s', ' (SQL redacted)', $text);
        $text = (string) preg_replace('/\bSQL:\s.*$/s', 'SQL: [redacted]', $text);
        // MySQL echoes the colliding value in unique-key violations.
        $text = (string) preg_replace("/Duplicate entry '.*?' for key/s", "Duplicate entry '[redacted]' for key", $text);

        // URLs: keep scheme/host/path, drop query + fragment.
        $text = (string) preg_replace_callback(
            '~\bhttps?://[^\s"\'<>]+~i',
            fn (array $m) => self::stripQuery($m[0]),
            $text,
        );
        // Credential-like query params in relative URLs or log text, e.g.
        // /documents/x/raw?expires=…&signature=…, ?access_token=…, ?key=…
        $text = (string) preg_replace(
            '/([?&](?:t|[A-Za-z0-9_.-]*(?:token|key|secret|signature|sig|password|passwd|pwd|code|expires|auth|session)[A-Za-z0-9_.-]*)=)[^&\s"\'<>)]+/i',
            '$1[redacted]',
            $text,
        );
        $text = (string) preg_replace('/\bBearer\s+[A-Za-z0-9._~+\/=-]+/i', 'Bearer [redacted]', $text);
        // Raw JWTs (access/refresh tokens are not always prefixed by Bearer).
        $text = (string) preg_replace('/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/', '[jwt]', $text);
        $text = (string) preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[email]', $text);

        return $text;
    }

    public static function stripQuery(string $url): string
    {
        $cut = strcspn($url, '?#');

        return substr($url, 0, $cut);
    }

    private static function dropFrameVars(?Stacktrace $stacktrace): void
    {
        foreach ($stacktrace?->getFrames() ?? [] as $frame) {
            $frame->setVars([]);
        }
    }
}
