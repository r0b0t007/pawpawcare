<?php

namespace Tests\Feature;

use App\Services\Extraction\AnthropicDriver;
use App\Services\Extraction\OpenAiCompatibleDriver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OpenAiCompatibleDriverTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.extraction.provider' => 'openai-compatible',
            'services.extraction.base_url' => 'https://llm.example.com/v1',
            'services.extraction.model' => 'qwen3-vl-test',
            'services.extraction.key' => 'sk-test',
        ]);
    }

    private function fakeCompletion(string $content): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $content]]]];
    }

    // ── Capabilities ─────────────────────────────────────────────────────────

    public function test_supports_images_but_not_pdfs(): void
    {
        $driver = new OpenAiCompatibleDriver;
        $this->assertTrue($driver->supportsMime('image/jpeg'));
        $this->assertTrue($driver->supportsMime('image/png'));
        $this->assertFalse($driver->supportsMime('application/pdf'));
    }

    public function test_anthropic_driver_supports_both(): void
    {
        $driver = new AnthropicDriver;
        $this->assertTrue($driver->supportsMime('image/jpeg'));
        $this->assertTrue($driver->supportsMime('application/pdf'));
        $this->assertSame('anthropic', $driver->meta()['provider']);
    }

    // ── Wire format ──────────────────────────────────────────────────────────

    public function test_sends_an_openai_compatible_vision_request(): void
    {
        Http::fake(['llm.example.com/*' => Http::response($this->fakeCompletion('{"document_type":"lab"}'))]);

        $result = (new OpenAiCompatibleDriver)->extract(
            'image/jpeg', 'raw-image-bytes', 'You extract vet data.', 'Extract everything.',
            ['type' => 'object'],
        );

        $this->assertSame('lab', $result['document_type']);

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $request->url() === 'https://llm.example.com/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer sk-test')
                && $body['model'] === 'qwen3-vl-test'
                && $body['response_format'] === ['type' => 'json_object']
                // Schema travels in the system prompt (json_object mode doesn't enforce shape).
                && str_contains($body['messages'][0]['content'], '"type":"object"')
                // Image rides as a base64 data URL.
                && str_starts_with($body['messages'][1]['content'][0]['image_url']['url'], 'data:image/jpeg;base64,')
                && $body['messages'][1]['content'][0]['image_url']['url'] === 'data:image/jpeg;base64,'.base64_encode('raw-image-bytes');
        });
    }

    // ── Output parsing ───────────────────────────────────────────────────────

    public function test_tolerates_markdown_code_fences(): void
    {
        Http::fake(['llm.example.com/*' => Http::response(
            $this->fakeCompletion("```json\n{\"document_type\": \"invoice\"}\n```")
        )]);

        $result = (new OpenAiCompatibleDriver)->extract('image/png', 'x', 's', 'u', []);

        $this->assertSame('invoice', $result['document_type']);
    }

    public function test_retries_once_when_the_model_returns_non_json(): void
    {
        Http::fakeSequence('llm.example.com/*')
            ->push($this->fakeCompletion('Sure! Here is the extracted data: oops'))
            ->push($this->fakeCompletion('{"document_type":"lab"}'));

        $result = (new OpenAiCompatibleDriver)->extract('image/png', 'x', 's', 'u', []);

        $this->assertSame('lab', $result['document_type']);
        Http::assertSentCount(2);
    }

    public function test_fails_after_the_retry_also_returns_non_json(): void
    {
        Http::fakeSequence('llm.example.com/*')
            ->push($this->fakeCompletion('not json'))
            ->push($this->fakeCompletion('still not json'));

        $this->expectException(\RuntimeException::class);

        (new OpenAiCompatibleDriver)->extract('image/png', 'x', 's', 'u', []);
    }
}
