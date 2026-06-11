<?php

namespace App\Services\Extraction;

use Illuminate\Support\Facades\Http;

/**
 * Any provider exposing an OpenAI-compatible Chat Completions endpoint with
 * vision input: Qwen (DashScope compatible mode), Kimi/Moonshot vision models,
 * OpenAI, OpenRouter, … Configured entirely from .env:
 *
 *   EXTRACTION_PROVIDER=openai-compatible
 *   EXTRACTION_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 *   EXTRACTION_MODEL=qwen3-vl-plus
 *   EXTRACTION_API_KEY=sk-…
 *
 * Two capability gaps vs the Anthropic driver, absorbed here:
 *  - Images only. PDFs would need rasterization (deliberately out of scope —
 *    see docs/specs/ai-document-intake.md). supportsMime() reports this and
 *    the controller turns it into a 422 before any tokens are spent.
 *  - json_object mode guarantees JSON, not schema conformance — so the schema
 *    rides in the system prompt, parsing strips code fences defensively, and
 *    one corrective retry is attempted before failing.
 */
class OpenAiCompatibleDriver implements ExtractionClient
{
    public function supportsMime(string $mime): bool
    {
        return str_starts_with($mime, 'image/');
    }

    public function meta(): array
    {
        return [
            'provider' => 'openai-compatible',
            'model' => (string) config('services.extraction.model'),
            'base_url' => (string) config('services.extraction.base_url'),
        ];
    }

    public function extract(string $mime, string $bytes, string $systemPrompt, string $userPrompt, array $schema): array
    {
        $messages = [
            [
                'role' => 'system',
                'content' => $systemPrompt
                    ."\n\nRespond with a single JSON object that validates against this JSON schema."
                    ." Output only the JSON — no prose, no markdown code fences.\n"
                    .json_encode($schema),
            ],
            [
                'role' => 'user',
                'content' => [
                    ['type' => 'image_url', 'image_url' => ['url' => 'data:'.$mime.';base64,'.base64_encode($bytes)]],
                    ['type' => 'text', 'text' => $userPrompt],
                ],
            ],
        ];

        $raw = $this->complete($messages);
        $data = $this->decode($raw);

        if ($data === null) {
            // json_object mode is widely but not universally honored — one
            // corrective round-trip before giving up.
            $messages[] = ['role' => 'assistant', 'content' => $raw];
            $messages[] = ['role' => 'user', 'content' => 'That was not valid JSON. Respond again with only the raw JSON object.'];
            $data = $this->decode($this->complete($messages));
        }

        if ($data === null) {
            throw new \RuntimeException('Extraction provider returned unparseable output');
        }

        return $data;
    }

    /** One Chat Completions round trip; returns the assistant text. */
    private function complete(array $messages): string
    {
        $response = Http::withToken((string) config('services.extraction.key'))
            ->timeout(90)
            ->post(rtrim((string) config('services.extraction.base_url'), '/').'/chat/completions', [
                'model' => (string) config('services.extraction.model'),
                'messages' => $messages,
                'max_tokens' => 4096,
                'response_format' => ['type' => 'json_object'],
            ])
            ->throw();

        return (string) $response->json('choices.0.message.content');
    }

    /** Decode model output to an array, tolerating markdown code fences. Null if unparseable. */
    private function decode(string $raw): ?array
    {
        $text = trim($raw);
        if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/s', $text, $m)) {
            $text = $m[1];
        }
        $data = json_decode($text, true);

        return is_array($data) ? $data : null;
    }
}
