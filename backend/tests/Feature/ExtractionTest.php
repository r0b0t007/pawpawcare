<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\DocumentExtractor;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
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

    // ── Extract endpoint ─────────────────────────────────────────────────────

    public function test_extracts_a_document_and_stores_the_suggestions(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->uploadDocument($token, $pet);

        $this->mock(DocumentExtractor::class)
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
        $this->mock(DocumentExtractor::class)
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

        $this->mock(DocumentExtractor::class)
            ->shouldReceive('extract')->once()->andThrow(new \RuntimeException('API down'));

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")
            ->assertStatus(502);

        $doc = Document::find($docId);
        $this->assertSame('failed', $doc->extraction_status);
        $this->assertNull($doc->extraction);

        // A failed document can be retried (status is not stuck on pending).
        $this->mock(DocumentExtractor::class)
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

        $this->mock(DocumentExtractor::class)->shouldReceive('extract')->never();

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

        $this->mock(DocumentExtractor::class)
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
}
