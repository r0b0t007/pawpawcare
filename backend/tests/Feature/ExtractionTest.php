<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\DocumentExtractor;
use App\Services\Extraction\ExtractionClient;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;
use Tests\TestCase;

class ExtractionTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(?string $email = null): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => $email ?? ('u'.uniqid().'@example.com'),
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        // Verified email: these users accept co-owner invites, which require it.
        $u->forceFill(['email_verified_at' => now()])->save();

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
    }

    private function uploadDocument(string $token, Pet $pet): string
    {
        return $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('record.jpg', 200, 200),
            'title' => 'Vet record',
        ])->assertCreated()->json('id');
    }

    /** A realistic sanitized payload, as the extractor would return it. */
    private function payload(): array
    {
        return [
            'document_type' => 'vaccination',
            'matches_pet' => true,
            'document_date' => '2026-05-12',
            'clinic' => ['name' => 'Happy Paws Vet', 'phone' => '555-1234', 'address' => null],
            'vaccinations' => [[
                'name' => 'Rabies', 'administered_date' => '2026-05-12',
                'due_date' => '2027-05-12', 'notes' => null,
            ]],
            'medications' => [],
            'weight' => ['value' => 18.4, 'unit' => 'kg', 'date' => '2026-05-12'],
            'total_cost' => 145.0,
            'suggested_title' => 'Rabies vaccination — Happy Paws Vet',
            'notes_for_owner' => null,
        ];
    }

    /** Mock the extractor; the capability gate passes unless a test says otherwise. */
    private function mockExtractor(): MockInterface
    {
        $mock = $this->mock(DocumentExtractor::class);
        $mock->allows('supports')->andReturnTrue();

        return $mock;
    }

    // ── Extract endpoint ─────────────────────────────────────────────────────

    public function test_extracts_a_document_and_stores_the_suggestions(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        $this->mockExtractor()
            ->shouldReceive('extract')->once()->andReturn($this->payload());

        $doc = $this->withToken($token)
            ->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertOk()->json();

        $this->assertSame('done', $doc['extraction_status']);
        $this->assertSame('Rabies', $doc['extraction']['vaccinations'][0]['name']);
        $this->assertNotNull($doc['extracted_at']);
    }

    public function test_a_completed_extraction_is_returned_without_rerunning(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        // `once` proves the second request never reaches the model.
        $this->mockExtractor()
            ->shouldReceive('extract')->once()->andReturn($this->payload());

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")->assertOk();
        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertOk()->assertJsonPath('extraction_status', 'done');
    }

    public function test_a_failed_extraction_marks_the_document_and_can_be_retried(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        $this->mockExtractor()
            ->shouldReceive('extract')->once()->andThrow(new \RuntimeException('API down'));

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertStatus(502);

        $doc = Document::find($docId);
        $this->assertSame('failed', $doc->extraction_status);
        $this->assertNull($doc->extraction);

        // A failed document can be retried (status is not stuck on pending).
        $this->mockExtractor()
            ->shouldReceive('extract')->once()->andReturn($this->payload());
        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertOk()->assertJsonPath('extraction_status', 'done');
    }

    // ── Access scoping ───────────────────────────────────────────────────────

    public function test_an_outsider_cannot_extract(): void
    {
        Storage::fake('local');
        [$owner, $ownerToken] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($ownerToken, $pet);

        $this->mockExtractor()->shouldReceive('extract')->never();

        $this->withToken($outsiderToken)
            ->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertNotFound();
        $this->assertSame('none', Document::find($docId)->extraction_status);
    }

    public function test_a_co_owner_can_extract(): void
    {
        Storage::fake('local');
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($ownerToken, $pet);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $member->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;
        $this->withToken($memberToken)->postJson("/invites/{$inviteId}/accept")->assertOk();

        $this->mockExtractor()
            ->shouldReceive('extract')->once()->andReturn($this->payload());

        $this->withToken($memberToken)
            ->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertOk()->assertJsonPath('extraction_status', 'done');
    }

    public function test_extraction_cannot_be_set_through_the_upload_endpoint(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        // Smuggling extraction fields into the multipart upload must be ignored
        // (the columns are guarded, not fillable).
        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'),
            'title' => 'X',
            'extraction_status' => 'done',
            'extraction' => '{"hacked":true}',
        ])->assertCreated()->json();

        $this->assertSame('none', $doc['extraction_status']);
        $this->assertNull($doc['extraction']);
    }

    // ── Provider abstraction ─────────────────────────────────────────────────

    /** A stub provider driver, configurable for capability and output. */
    private function bindStubClient(bool $supports = true, array $returns = []): void
    {
        $this->app->bind(ExtractionClient::class, fn () => new class($supports, $returns) implements ExtractionClient
        {
            public function __construct(private bool $supports, private array $returns) {}

            public function supportsMime(string $mime): bool
            {
                return $this->supports;
            }

            public function extract(string $mime, string $bytes, string $systemPrompt, string $userPrompt, array $schema): array
            {
                return $this->returns;
            }

            public function meta(): array
            {
                return ['provider' => 'stub', 'model' => 'stub-1'];
            }
        });
    }

    public function test_unsupported_document_type_returns_422_before_calling_the_model(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        // Real DocumentExtractor, stub provider that can't read anything.
        $this->bindStubClient(supports: false);

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertStatus(422);
        $this->assertSame('none', Document::find($docId)->extraction_status);
    }

    public function test_extraction_is_stamped_with_provider_meta(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        // Real DocumentExtractor + sanitize, stub provider output.
        $this->bindStubClient(returns: [
            'document_type' => 'vaccination',
            'vaccinations' => [['name' => 'Rabies', 'administered_date' => '2026-05-12']],
        ]);

        $doc = $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertOk()->json();

        $this->assertSame('stub', $doc['extraction']['_meta']['provider']);
        $this->assertSame('Rabies', $doc['extraction']['vaccinations'][0]['name']);
    }

    // ── Output schema (validated by the provider before the model runs) ─────

    public function test_schema_uses_only_anyof_for_nullables_and_stays_under_the_union_cap(): void
    {
        $extractor = (new \ReflectionClass(DocumentExtractor::class))->newInstanceWithoutConstructor();
        $schema = (new \ReflectionMethod(DocumentExtractor::class, 'schema'))->invoke($extractor);

        // Anthropic rejected the whole request (400, every document) when an
        // enum sat next to "type": ["string", "null"]. Nullables are anyOf
        // only, and the API caps union (anyOf / type-array) parameters at 16
        // per schema — over it, every request 400s again.
        $offenders = [];
        $unions = 0;
        $visit = function (array $node, string $path) use (&$visit, &$offenders, &$unions) {
            if (is_array($node['type'] ?? null)) {
                $offenders[] = "{$path}: type array";
            }
            if (in_array(null, $node['enum'] ?? [], true)) {
                $offenders[] = "{$path}: null inside enum";
            }
            if (isset($node['anyOf'])) {
                $unions++;
                foreach ($node['anyOf'] as $i => $branch) {
                    $visit($branch, "{$path}.anyOf[{$i}]");
                }
            }
            // Walk schema positions only, so a property named like a keyword
            // ("type", "items") is never mistaken for one.
            foreach ($node['properties'] ?? [] as $name => $child) {
                $visit($child, "{$path}.{$name}");
            }
            if (isset($node['items'])) {
                $visit($node['items'], "{$path}[]");
            }
        };
        $visit($schema, '$');

        $this->assertSame([], $offenders);
        $this->assertLessThanOrEqual(16, $unions, 'Anthropic allows at most 16 union parameters per schema');

        $frequency = $schema['properties']['medications']['items']['properties']['frequency'];
        $this->assertContains(['type' => 'null'], $frequency['anyOf']);
        $this->assertNotEmpty(array_filter($frequency['anyOf'], fn ($b) => isset($b['enum'])));
    }

    // ── Sanitization (model output is untrusted input) ───────────────────────

    public function test_sanitize_enforces_enums_dates_and_lengths(): void
    {
        $extractor = (new \ReflectionClass(DocumentExtractor::class))->newInstanceWithoutConstructor();
        $sanitize = new \ReflectionMethod(DocumentExtractor::class, 'sanitize');

        $dirty = [
            'document_type' => 'malware',                       // not in the enum
            'matches_pet' => false,
            'document_date' => 'yesterday',                     // not a date
            'clinic' => ['name' => str_repeat('A', 999)],       // over column limit
            'vaccinations' => [
                ['name' => '  Rabies  ', 'administered_date' => '2026-05-12', 'due_date' => 'soon'],
                ['administered_date' => '2026-05-12'],          // no name → dropped
                'not-an-object',                                // wrong type → dropped
            ],
            'medications' => [
                ['name' => 'Simparica', 'frequency' => 'hourly'], // bad enum → null
            ],
            'weight' => ['value' => -5, 'unit' => 'kg'],        // non-positive → dropped
            'total_cost' => 'expensive',                        // not numeric → null
            'suggested_title' => 'Visit',
        ];

        $clean = $sanitize->invoke($extractor, $dirty);

        $this->assertSame('other', $clean['document_type']);
        $this->assertFalse($clean['matches_pet']);
        $this->assertNull($clean['document_date']);
        $this->assertSame(150, mb_strlen($clean['clinic']['name']));
        $this->assertCount(1, $clean['vaccinations']);
        $this->assertSame('Rabies', $clean['vaccinations'][0]['name']);
        $this->assertNull($clean['vaccinations'][0]['due_date']);
        $this->assertNull($clean['medications'][0]['frequency']);
        $this->assertNull($clean['weight']);
        $this->assertNull($clean['total_cost']);
    }

    public function test_sanitize_accepts_enum_values_in_any_capitalisation(): void
    {
        $extractor = (new \ReflectionClass(DocumentExtractor::class))->newInstanceWithoutConstructor();
        $sanitize = new \ReflectionMethod(DocumentExtractor::class, 'sanitize');

        // Structured outputs don't guarantee enum capitalisation.
        $clean = $sanitize->invoke($extractor, [
            'document_type' => 'Vaccination',
            'medications' => [['name' => 'Milbemax', 'frequency' => 'Monthly']],
            'weight' => ['value' => 28.4, 'unit' => 'KG'],
        ]);

        $this->assertSame('vaccination', $clean['document_type']);
        $this->assertSame('monthly', $clean['medications'][0]['frequency']);
        $this->assertSame('kg', $clean['weight']['unit']);
    }
}
