<?php

namespace App\Services;

use Anthropic\Client;
use App\Models\Document;
use App\Models\Pet;
use App\Support\Uploads;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Reads a vault document (PDF or image) with the Claude API and returns
 * structured suggestions — vaccinations, medications, weight, clinic, cost —
 * for the user to review before anything is saved.
 *
 * The structured-output schema guarantees the response SHAPE; the values are
 * still untrusted (a model can misread a date), so everything passes through
 * sanitize() and the user-facing review step before touching real records.
 */
class DocumentExtractor
{
    /** Document categories the extractor may suggest — mirrors the documents.category enum. */
    private const CATEGORIES = ['lab', 'vaccination', 'prescription', 'invoice', 'imaging', 'insurance', 'other'];

    private const FREQUENCIES = ['daily', 'weekly', 'monthly', 'as_needed'];

    public function __construct(private ?Client $client = null)
    {
        $this->client ??= new Client(apiKey: (string) config('services.anthropic.key'));
    }

    /**
     * Run the extraction. Returns the sanitized suggestion payload.
     * Throws on API failure — the caller owns extraction_status transitions.
     */
    public function extract(Document $doc, Pet $pet): array
    {
        $bytes = Storage::disk(Uploads::PRIVATE_DISK)->get($doc->file_path);
        $source = [
            'type' => 'base64',
            'mediaType' => $doc->mime ?: 'application/pdf',
            'data' => base64_encode($bytes),
        ];
        $block = $doc->mime === 'application/pdf'
            ? ['type' => 'document', 'source' => $source]
            : ['type' => 'image', 'source' => $source];

        $message = $this->client->messages->create(
            model: (string) config('services.anthropic.model'),
            maxTokens: 4096,
            thinking: ['type' => 'adaptive'],
            system: $this->systemPrompt($pet),
            messages: [[
                'role' => 'user',
                'content' => [
                    $block,
                    ['type' => 'text', 'text' => 'Extract all veterinary medical information from this document.'],
                ],
            ]],
            outputConfig: ['format' => ['type' => 'json_schema', 'schema' => $this->schema()]],
            requestOptions: ['timeout' => 90],
        );

        $json = '';
        foreach ($message->content as $content) {
            if ($content->type === 'text') {
                $json = $content->text;
                break;
            }
        }

        return $this->sanitize((array) json_decode($json, true));
    }

    private function systemPrompt(Pet $pet): string
    {
        $age = $pet->age !== null ? "{$pet->age}-year-old " : '';
        $breed = $pet->breed ? "{$pet->breed} " : '';

        return <<<PROMPT
            You extract structured data from veterinary documents for a pet health app.
            The document belongs to {$pet->name}, a {$age}{$breed}{$pet->type}.
            Set matches_pet to false if the document clearly refers to a different animal.
            Extract only what is explicitly present in the document — never infer or invent
            values; use null when a field is absent or illegible. Dates must be YYYY-MM-DD.
            PROMPT;
    }

    /**
     * Defensive pass over the model output: enforce enums, clamp string lengths
     * to column limits, validate dates, and drop entries missing required values.
     */
    private function sanitize(array $raw): array
    {
        $str = fn ($v, int $max) => is_string($v) && trim($v) !== '' ? mb_substr(trim($v), 0, $max) : null;
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
                'frequency' => in_array($m['frequency'] ?? null, self::FREQUENCIES, true) ? $m['frequency'] : null,
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
                'unit' => in_array($raw['weight']['unit'] ?? null, ['kg', 'lb'], true) ? $raw['weight']['unit'] : 'kg',
                'date' => $date($raw['weight']['date'] ?? null),
            ];
        }

        $cost = is_numeric($raw['total_cost'] ?? null) && $raw['total_cost'] > 0
            ? round((float) $raw['total_cost'], 2)
            : null;

        return [
            'document_type' => in_array($raw['document_type'] ?? null, self::CATEGORIES, true)
                ? $raw['document_type'] : 'other',
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
        $nullableString = ['type' => ['string', 'null']];
        $nullableDate = ['type' => ['string', 'null'], 'format' => 'date'];

        return [
            'type' => 'object',
            'properties' => [
                'document_type' => ['type' => 'string', 'enum' => self::CATEGORIES],
                'matches_pet' => ['type' => 'boolean'],
                'document_date' => $nullableDate,
                'clinic' => [
                    'type' => ['object', 'null'],
                    'properties' => [
                        'name' => ['type' => 'string'],
                        'phone' => $nullableString,
                        'address' => $nullableString,
                    ],
                    'required' => ['name', 'phone', 'address'],
                    'additionalProperties' => false,
                ],
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
                            'frequency' => ['type' => ['string', 'null'], 'enum' => [...self::FREQUENCIES, null]],
                            'start_date' => $nullableDate,
                            'end_date' => $nullableDate,
                            'notes' => $nullableString,
                        ],
                        'required' => ['name', 'dosage', 'frequency', 'start_date', 'end_date', 'notes'],
                        'additionalProperties' => false,
                    ],
                ],
                'weight' => [
                    'type' => ['object', 'null'],
                    'properties' => [
                        'value' => ['type' => 'number'],
                        'unit' => ['type' => 'string', 'enum' => ['kg', 'lb']],
                        'date' => $nullableDate,
                    ],
                    'required' => ['value', 'unit', 'date'],
                    'additionalProperties' => false,
                ],
                'total_cost' => ['type' => ['number', 'null']],
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
