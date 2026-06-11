<?php

namespace App\Services\Extraction;

/**
 * A vision-capable LLM provider that can read a vault document and return
 * structured JSON. DocumentExtractor owns everything provider-agnostic
 * (prompt, schema, sanitation); drivers own only the wire format.
 *
 * Drivers are selected by EXTRACTION_PROVIDER (see AppServiceProvider).
 */
interface ExtractionClient
{
    /** Whether this provider can read documents of the given mime type. */
    public function supportsMime(string $mime): bool;

    /**
     * Send the document to the model and return its decoded JSON output.
     * The shape is best-effort — callers must treat it as untrusted and
     * sanitize. Throws on transport/provider failure.
     */
    public function extract(string $mime, string $bytes, string $systemPrompt, string $userPrompt, array $schema): array;

    /**
     * Provider/model identity, stored alongside the extraction so quality
     * issues can be attributed when comparing providers.
     */
    public function meta(): array;
}
