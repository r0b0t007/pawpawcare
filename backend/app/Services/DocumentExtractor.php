<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Pet;
use App\Services\Extraction\ExtractionClient;
use App\Support\Uploads;
use Illuminate\Support\Carbon;

/**
 * Reads a vault document (PDF or image) with a vision LLM and returns
 * structured suggestions — vaccinations, medications, weight, clinic, cost —
 * for the user to review before anything is saved.
 *
 * Provider-agnostic: the prompt, schema, and sanitation live here; the wire
 * call lives behind ExtractionClient (Anthropic by default, any OpenAI-
 * compatible vision provider via EXTRACTION_PROVIDER — see AppServiceProvider).
 *
 * Model output is untrusted regardless of provider (a model can misread a
 * date), so everything passes through sanitize() and the user-facing review
 * step before touching real records.
 */
class DocumentExtractor
{
    /** Document categories the extractor may suggest — mirrors the documents.category enum. */
    private const CATEGORIES = ['lab', 'vaccination', 'prescription', 'invoice', 'imaging', 'insurance', 'other'];

    private const FREQUENCIES = ['daily', 'weekly', 'monthly', 'as_needed'];

    public function __construct(private ExtractionClient $client) {}

    /** Whether the configured provider can read this document at all. */
    public function supports(Document $doc): bool
    {
        return $this->client->supportsMime($doc->mime ?: 'application/pdf');
    }

    /**
     * Run the extraction. Returns the sanitized suggestion payload.
     * Throws on API failure — the caller owns extraction_status transitions.
     */
    public function extract(Document $doc, Pet $pet): array
    {
        $raw = $this->client->extract(
            $doc->mime ?: 'application/pdf',
            Uploads::privateDisk()->get($doc->file_path),
            $this->systemPrompt($pet),
            'Extract all veterinary medical information from this document.',
            $this->schema(),
        );

        $clean = $this->sanitize($raw);
        $clean['_meta'] = $this->client->meta();

        return $clean;
    }

    private function systemPrompt(Pet $pet): string
    {
        $age = $pet->age !== null ? "{$pet->age}-year-old " : '';
        $breed = $pet->breed ? "{$pet->breed} " : '';
        // The requester's language (SetLocale: saved preference, then
        // Accept-Language), so the title and notes read naturally to them.
        $language = ['fr' => 'French', 'es' => 'Spanish'][app()->getLocale()] ?? 'English';

        return <<<PROMPT
            You extract structured data from veterinary documents for a pet health app.
            The document belongs to {$pet->name}, a {$age}{$breed}{$pet->type}.
            Set matches_pet to false if the document clearly refers to a different animal.
            Extract only what is explicitly present in the document — never infer or invent
            values; use null when a field is absent or illegible. Dates must be YYYY-MM-DD.
            Write suggested_title, notes_for_owner and any notes of your own in {$language}.
            Copy names, products, dosages and clinic details exactly as they appear in the
            document; never translate them. Use plain text, not HTML entities.
            PROMPT;
    }

    /**
     * Defensive pass over the model output: enforce enums, clamp string lengths
     * to column limits, validate dates, and drop entries missing required values.
     */
    private function sanitize(array $raw): array
    {
        // Plain text only: the model sometimes HTML-escapes ("Record &amp;
        // Invoice"), which the app would show verbatim.
        $str = function ($v, int $max): ?string {
            // Unicode-aware trim: &nbsp; decodes to U+00A0, which trim() keeps.
            $text = is_string($v)
                ? (preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '')
                : '';

            return $text !== '' ? mb_substr($text, 0, $max) : null;
        };
        // Structured outputs don't guarantee enum capitalisation ("Daily"),
        // so compare case-insensitively rather than drop a correct reading.
        $enum = fn ($v, array $allowed) => is_string($v) && in_array($l = strtolower(trim($v)), $allowed, true) ? $l : null;
        $date = function ($v): ?string {
            if (! is_string($v)) {
                return null;
            }
            try {
                return Carbon::createFromFormat('Y-m-d', $v)->format('Y-m-d');
            } catch (\Throwable) {
                return null;
            }
        };

        $clinic = null;
        if (is_array($raw['clinic'] ?? null) && $str($raw['clinic']['name'] ?? null, 150)) {
            $clinic = [
                'name' => $str($raw['clinic']['name'], 150),
                'phone' => $str($raw['clinic']['phone'] ?? null, 50),
                'address' => $str($raw['clinic']['address'] ?? null, 255),
            ];
        }

        $vaccinations = collect(is_array($raw['vaccinations'] ?? null) ? $raw['vaccinations'] : [])
            ->map(fn ($v) => is_array($v) ? [
                'name' => $str($v['name'] ?? null, 150),
                'administered_date' => $date($v['administered_date'] ?? null),
                'due_date' => $date($v['due_date'] ?? null),
                'notes' => $str($v['notes'] ?? null, 500),
            ] : null)
            ->filter(fn ($v) => $v && $v['name'])
            ->values()->all();

        $medications = collect(is_array($raw['medications'] ?? null) ? $raw['medications'] : [])
            ->map(fn ($m) => is_array($m) ? [
                'name' => $str($m['name'] ?? null, 150),
                'dosage' => $str($m['dosage'] ?? null, 100),
                'frequency' => $enum($m['frequency'] ?? null, self::FREQUENCIES),
                'start_date' => $date($m['start_date'] ?? null),
                'end_date' => $date($m['end_date'] ?? null),
                'notes' => $str($m['notes'] ?? null, 500),
            ] : null)
            ->filter(fn ($m) => $m && $m['name'])
            ->values()->all();

        $weight = null;
        if (is_array($raw['weight'] ?? null) && is_numeric($raw['weight']['value'] ?? null) && $raw['weight']['value'] > 0) {
            $weight = [
                'value' => round((float) $raw['weight']['value'], 2),
                'unit' => $enum($raw['weight']['unit'] ?? null, ['kg', 'lb']) ?? 'kg',
                'date' => $date($raw['weight']['date'] ?? null),
            ];
        }

        $cost = is_numeric($raw['total_cost'] ?? null) && $raw['total_cost'] > 0
            ? round((float) $raw['total_cost'], 2)
            : null;

        return [
            'document_type' => $enum($raw['document_type'] ?? null, self::CATEGORIES) ?? 'other',
            'matches_pet' => ($raw['matches_pet'] ?? true) !== false,
            'document_date' => $date($raw['document_date'] ?? null),
            'clinic' => $clinic,
            'vaccinations' => $vaccinations,
            'medications' => $medications,
            'weight' => $weight,
            'total_cost' => $cost,
            'suggested_title' => $str($raw['suggested_title'] ?? null, 150),
            'notes_for_owner' => $str($raw['notes_for_owner'] ?? null, 1000),
        ];
    }

    /** JSON schema for structured output — mirrors the app's model fields. */
    private function schema(): array
    {
        // Every nullable field is anyOf [schema, null] — never a type array.
        // The API rejected a type array next to an enum ("Enum value 'daily'
        // does not match declared type ['string', 'null']"), failing every
        // document; one idiom leaves nothing to get wrong per keyword. Each
        // anyOf counts toward the API's cap of 16 union parameters per
        // schema (ExtractionTest guards it), so add nullable fields sparingly.
        $nullable = fn (array $schema) => ['anyOf' => [$schema, ['type' => 'null']]];
        $nullableString = $nullable(['type' => 'string']);
        $nullableDate = $nullable(['type' => 'string', 'format' => 'date']);

        return [
            'type' => 'object',
            'properties' => [
                'document_type' => ['type' => 'string', 'enum' => self::CATEGORIES],
                'matches_pet' => ['type' => 'boolean'],
                'document_date' => $nullableDate,
                'clinic' => $nullable([
                    'type' => 'object',
                    'properties' => [
                        'name' => ['type' => 'string'],
                        'phone' => $nullableString,
                        'address' => $nullableString,
                    ],
                    'required' => ['name', 'phone', 'address'],
                    'additionalProperties' => false,
                ]),
                'vaccinations' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'name' => ['type' => 'string'],
                            'administered_date' => $nullableDate,
                            'due_date' => $nullableDate,
                            'notes' => $nullableString,
                        ],
                        'required' => ['name', 'administered_date', 'due_date', 'notes'],
                        'additionalProperties' => false,
                    ],
                ],
                'medications' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'name' => ['type' => 'string'],
                            'dosage' => $nullableString,
                            'frequency' => $nullable(['type' => 'string', 'enum' => self::FREQUENCIES]),
                            'start_date' => $nullableDate,
                            'end_date' => $nullableDate,
                            'notes' => $nullableString,
                        ],
                        'required' => ['name', 'dosage', 'frequency', 'start_date', 'end_date', 'notes'],
                        'additionalProperties' => false,
                    ],
                ],
                'weight' => $nullable([
                    'type' => 'object',
                    'properties' => [
                        'value' => ['type' => 'number'],
                        'unit' => ['type' => 'string', 'enum' => ['kg', 'lb']],
                        'date' => $nullableDate,
                    ],
                    'required' => ['value', 'unit', 'date'],
                    'additionalProperties' => false,
                ]),
                'total_cost' => $nullable(['type' => 'number']),
                'suggested_title' => ['type' => 'string'],
                'notes_for_owner' => $nullableString,
            ],
            'required' => [
                'document_type', 'matches_pet', 'document_date', 'clinic', 'vaccinations',
                'medications', 'weight', 'total_cost', 'suggested_title', 'notes_for_owner',
            ],
            'additionalProperties' => false,
        ];
    }
}
