<?php

namespace Tests\Feature;

use Anthropic\Client;
use App\Services\Extraction\AnthropicDriver;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tests\TestCase;

/**
 * The Anthropic driver against a fake HTTP transport: what it sends, and
 * that a cut-off, refused or unreadable answer fails loudly (so the document
 * is marked failed and retryable) instead of being stored as "nothing found".
 */
class AnthropicDriverTest extends TestCase
{
    private ?array $sent = null;

    private function driver(string $stopReason, string $text): AnthropicDriver
    {
        config(['services.anthropic.model' => 'claude-haiku-5-5']);

        $transport = new class($this, $stopReason, $text) implements ClientInterface
        {
            public function __construct(private AnthropicDriverTest $test, private string $stop, private string $text) {}

            public function sendRequest(RequestInterface $request): ResponseInterface
            {
                $this->test->record(json_decode((string) $request->getBody(), true));

                return new Response(200, ['Content-Type' => 'application/json'], json_encode([
                    'id' => 'msg_test',
                    'type' => 'message',
                    'role' => 'assistant',
                    'model' => 'claude-haiku-5-5',
                    'content' => [['type' => 'text', 'text' => $this->text]],
                    'stop_reason' => $this->stop,
                    'stop_sequence' => null,
                    'usage' => ['input_tokens' => 10, 'output_tokens' => 5],
                ]));
            }
        };

        return new AnthropicDriver(new Client(
            apiKey: 'test-key',
            requestOptions: ['transporter' => $transport, 'maxRetries' => 0],
        ));
    }

    public function record(?array $body): void
    {
        $this->sent = $body;
    }

    private function extract(AnthropicDriver $driver): array
    {
        return $driver->extract('application/pdf', '%PDF-1.4', 'system', 'user', ['type' => 'object']);
    }

    public function test_returns_the_decoded_answer_and_sends_the_schema(): void
    {
        $data = $this->extract($this->driver('end_turn', '{"document_type":"lab"}'));

        $this->assertSame(['document_type' => 'lab'], $data);
        $this->assertSame('claude-haiku-5-5', $this->sent['model']);
        $this->assertSame(['type' => 'adaptive'], $this->sent['thinking']);
        $this->assertSame(['type' => 'object'], $this->sent['output_config']['format']['schema']);
        $this->assertGreaterThan(4096, $this->sent['max_tokens']);
    }

    public function test_a_cut_off_answer_throws(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('max_tokens');
        $this->extract($this->driver('max_tokens', '{"document_type":"la'));
    }

    public function test_a_refusal_throws(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('refusal');
        $this->extract($this->driver('refusal', 'I cannot help with that.'));
    }

    public function test_unparseable_output_throws(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('unparseable');
        $this->extract($this->driver('end_turn', 'not json'));
    }
}
