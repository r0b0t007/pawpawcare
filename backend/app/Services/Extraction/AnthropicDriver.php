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
            maxTokens: 4096,
            thinking: ['type' => 'adaptive'],
            system: $systemPrompt,
            messages: [[
                'role' => 'user',
                'content' => [$block, ['type' => 'text', 'text' => $userPrompt]],
            ]],
            outputConfig: ['format' => ['type' => 'json_schema', 'schema' => $schema]],
            requestOptions: ['timeout' => 90],
        );

        foreach ($message->content as $content) {
            if ($content->type === 'text') {
                return (array) json_decode($content->text, true);
            }
        }

        return [];
    }
}
