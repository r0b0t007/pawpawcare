<?php

namespace Tests\Unit;

use App\Support\SentryScrubber;
use PHPUnit\Framework\TestCase;
use Sentry\Breadcrumb;
use Sentry\Event;
use Sentry\ExceptionDataBag;
use Sentry\Frame;
use Sentry\Stacktrace;
use Sentry\Tracing\Span;
use Sentry\UserDataBag;

class SentryScrubberTest extends TestCase
{
    public function test_request_keeps_only_method_and_path(): void
    {
        $out = SentryScrubber::scrubRequest([
            'method' => 'GET',
            'url' => 'https://api.pawpawcare.app/documents/abc/raw?expires=1&signature=deadbeef',
            'query_string' => 'expires=1&signature=deadbeef',
            'data' => ['notes' => 'Bella vomited twice'],
            'cookies' => ['session' => 'x'],
            'headers' => ['Authorization' => 'Bearer eyJ.secret'],
            'env' => ['REMOTE_ADDR' => '203.0.113.9'],
        ]);

        $this->assertSame(['method' => 'GET', 'url' => 'https://api.pawpawcare.app/documents/abc/raw'], $out);
    }

    public function test_text_redacts_emails_tokens_and_query_strings(): void
    {
        $text = 'Mail to owner@example.com failed; GET https://x.test/share/p1?signature=abc#frag with Bearer eyJhbGciOi.payload.sig';

        $out = SentryScrubber::scrubText($text);

        $this->assertStringNotContainsString('owner@example.com', $out);
        $this->assertStringNotContainsString('signature=abc', $out);
        $this->assertStringNotContainsString('eyJhbGciOi', $out);
        $this->assertStringContainsString('https://x.test/share/p1', $out);
        $this->assertStringContainsString('[email]', $out);
        $this->assertStringContainsString('Bearer [redacted]', $out);
    }

    public function test_database_error_sql_with_inlined_values_is_redacted(): void
    {
        // Laravel 13 QueryException message format: bound values are inlined.
        $msg = 'SQLSTATE[HY000] [1040] Too many connections (Connection: mysql, Host: localhost, Port: 3306, Database: app, '
            .'SQL: select * from `refresh_tokens` where `token` = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln and `revoked` = 0 limit 1)';

        $out = SentryScrubber::scrubText($msg);

        $this->assertSame('SQLSTATE[HY000] [1040] Too many connections (SQL redacted)', $out);
        $this->assertSame('Failed: SQL: [redacted]', SentryScrubber::scrubText("Failed: SQL: update users set notes = 'Bella seizures'"));
        $this->assertSame(
            "SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry '[redacted]' for key 'pets_share_token_unique'",
            SentryScrubber::scrubText("SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry 'a1b2c3token' for key 'pets_share_token_unique'"),
        );
    }

    public function test_raw_jwts_and_relative_signed_urls_are_redacted(): void
    {
        $out = SentryScrubber::scrubText('refresh eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl failed for /documents/9/raw?expires=17&signature=abc123');

        $this->assertStringNotContainsString('eyJ', $out);
        $this->assertStringNotContainsString('abc123', $out);
        $this->assertStringContainsString('[jwt]', $out);
        $this->assertStringContainsString('/documents/9/raw?expires=[redacted]&signature=[redacted]', $out);

        // Any credential-looking param name, not just a fixed list; others survive.
        $this->assertSame(
            '/auth/x?access_token=[redacted]&api_key=[redacted]&id_token=[redacted]&password=[redacted]&t=[redacted]&page=2',
            SentryScrubber::scrubText('/auth/x?access_token=opaque123&api_key=sk-live-9&id_token=abc&password=hunter2&t=xyz&page=2'),
        );
    }

    public function test_extra_contexts_tags_breadcrumb_data_frames_and_spans_are_scrubbed(): void
    {
        $event = Event::createEvent();
        // What the `sentry` log channel attaches for Log::error('…', ['error' => $e->getMessage()]).
        $event->setExtra(['log_context' => ['error' => '550 5.1.1 <owner@example.com>: Recipient address rejected']]);
        $event->setTags(['note' => 'mail owner@example.com']);
        $event->setContext('laravel', ['last_error' => 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln']);
        $event->setContext('runtime', ['name' => 'php', 'version' => '8.4']);
        $event->setBreadcrumb([
            new Breadcrumb(Breadcrumb::LEVEL_INFO, Breadcrumb::TYPE_DEFAULT, 'log.error', 'Mail failed', [
                'error' => 'rejected owner@example.com',
                'nested' => ['args' => ['email' => 'admin@example.com']],
            ]),
        ]);

        $exception = new ExceptionDataBag(new \RuntimeException('boom'));
        $frame = new Frame('where', 'Builder.php', 10, null, null, ['value' => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln']);
        $exception->setStacktrace(new Stacktrace([$frame]));
        $event->setExceptions([$exception]);

        $span = new Span;
        $span->setData(['url' => 'https://api.test/x', 'http.query' => 'token=secret', 'error' => 'for owner@example.com']);
        $span->setDescription("UPDATE pets SET share_token = 'x' WHERE id = 1 -- GET https://api.test/raw?signature=abc for owner@example.com");
        $event->setSpans([$span]);

        $out = SentryScrubber::beforeSend($event);

        $this->assertSame(['log_context' => ['error' => '550 5.1.1 <[email]>: Recipient address rejected']], $out->getExtra());
        $this->assertSame(['note' => 'mail [email]'], $out->getTags());
        $this->assertSame('token [jwt]', $out->getContexts()['laravel']['last_error']);
        $this->assertSame(['name' => 'php', 'version' => '8.4'], $out->getContexts()['runtime']);

        $meta = $out->getBreadcrumbs()[0]->getMetadata();
        $this->assertSame('rejected [email]', $meta['error']);
        $this->assertSame(['args' => ['email' => '[email]']], $meta['nested']);

        $this->assertSame([], $out->getExceptions()[0]->getStacktrace()->getFrames()[0]->getVars());

        $spanData = $out->getSpans()[0]->getData();
        $this->assertSame('', $spanData['http.query']);
        $this->assertSame('for [email]', $spanData['error']);
        $description = $out->getSpans()[0]->getDescription();
        $this->assertStringNotContainsString('signature=abc', $description);
        $this->assertStringNotContainsString('owner@example.com', $description);
    }

    public function test_event_user_is_reduced_to_id_and_everything_is_scrubbed(): void
    {
        $event = Event::createEvent();
        $event->setRequest(['method' => 'POST', 'url' => 'https://api.test/care/p1?token=t', 'data' => ['a' => 'b']]);
        $user = UserDataBag::createFromUserIdentifier('user-uuid');
        $user->setEmail('owner@example.com');
        $user->setIpAddress('203.0.113.9');
        $event->setUser($user);
        $event->setMessage('Failed for owner@example.com');
        $event->setExceptions([new ExceptionDataBag(new \RuntimeException('Could not reach https://api.test/x?key=secret'))]);
        $event->setBreadcrumb([
            new Breadcrumb(Breadcrumb::LEVEL_INFO, Breadcrumb::TYPE_HTTP, 'http', null, [
                'url' => 'https://api.revenuecat.com/v2/x?y=1',
                'http.query' => 'y=1',
            ]),
            new Breadcrumb(Breadcrumb::LEVEL_INFO, Breadcrumb::TYPE_DEFAULT, 'log', 'Sent code to owner@example.com'),
        ]);
        $event->setTransaction('/documents/abc/raw?signature=z');

        $out = SentryScrubber::beforeSend($event);

        $this->assertSame(['method' => 'POST', 'url' => 'https://api.test/care/p1'], $out->getRequest());
        $this->assertSame('user-uuid', $out->getUser()->getId());
        $this->assertNull($out->getUser()->getEmail());
        $this->assertNull($out->getUser()->getIpAddress());
        $this->assertSame('Failed for [email]', $out->getMessage());
        $this->assertSame('Could not reach https://api.test/x', $out->getExceptions()[0]->getValue());

        [$http, $log] = $out->getBreadcrumbs();
        $this->assertSame('https://api.revenuecat.com/v2/x', $http->getMetadata()['url']);
        $this->assertArrayNotHasKey('http.query', $http->getMetadata());
        $this->assertSame('Sent code to [email]', $log->getMessage());
        $this->assertSame('/documents/abc/raw', $out->getTransaction());
    }
}
