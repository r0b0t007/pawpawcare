<?php

namespace App\Services\Extraction;

use Anthropic\Client;

/**
 * Claude via the official Anthropic SDK. The richest driver: native PDF
 * document blocks and schema-enforced structured output (the API guarantees
 * the response validates against the JSON schema).
 */
class AnthropicDriver implements ExtractionClient
{
    public function __construct(private ?Client $client = null)
    {
        $this->client ??= new Client(apiKey: (string) config('services.anthropic.key'));
    }

    public function supportsMime(string $mime): bool
    {
        return $mime === 'application/pdf' || str_starts_with($mime, 'image/');
    }

    public function meta(): array
    {
        return ['provider' => 'anthropic', 'model' => (string) config('services.anthropic.model')];
    }

    public function extract(string $mime, string $bytes, string $systemPrompt, string $userPrompt, array $schema): array
    {
        $source = ['type' => 'base64', 'mediaType' => $mime, 'data' => base64_encode($bytes)];
        $block = $mime === 'application/pdf'
            ? ['type' => 'document', 'source' => $source]
            : ['type' => 'image', 'source' => $source];

        $message = $this->client->messages->create(
            model: (string) config('services.anthropic.model'),
            // Adaptive thinking shares this budget with the JSON answer; a
            // long multi-page record cut off here would be unparseable.
            maxTokens: 16000,
            thinking: ['type' => 'adaptive'],
            system: $systemPrompt,
            messages: [[
                'role' => 'user',
                'content' => [$block, ['type' => 'text', 'text' => $userPrompt]],
            ]],
            outputConfig: ['format' => ['type' => 'json_schema', 'schema' => $schema]],
            requestOptions: ['timeout' => 90],
        );

        // A cut-off or refused answer may not match the schema. Throw so the
        // document is marked failed and can be retried, rather than storing
        // an empty "nothing found" result as a success.
        if (in_array($message->stopReason, ['max_tokens', 'refusal'], true)) {
            throw new \RuntimeException("Extraction stopped early: {$message->stopReason}");
        }

        foreach ($message->content as $content) {
            if ($content->type === 'text') {
                $data = json_decode($content->text, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        throw new \RuntimeException('Extraction provider returned unparseable output');
    }
}
