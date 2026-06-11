<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Document;
use App\Models\Expense;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\Reminder;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ApplyExtractionTest extends TestCase
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

    /** Upload a document and mark it extracted, ready for apply. */
    private function extractedDocument(string $token, Pet $pet): Document
    {
        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('record.jpg'),
            'title' => 'Vet record',
        ])->assertCreated()->json('id');

        $doc = Document::find($docId);
        $doc->forceFill([
            'extraction_status' => 'done',
            'extraction' => [
                'document_type' => 'vaccination',
                'suggested_title' => 'Rabies shot — Happy Paws',
                'matches_pet' => true,
            ],
            'extracted_at' => now(),
        ])->save();

        return $doc;
    }

    private function fullPayload(): array
    {
        return [
            'vaccinations' => [
                [
                    'name' => 'Rabies',
                    'administered_date' => Carbon::today()->subMonth()->format('Y-m-d'),
                    'due_date' => Carbon::today()->addYear()->format('Y-m-d'),
                ],
                ['name' => 'DHPP', 'administered_date' => Carbon::today()->subMonth()->format('Y-m-d')],
            ],
            'medications' => [
                ['name' => 'Simparica', 'dosage' => '40mg', 'frequency' => 'monthly'],
            ],
            'weight' => ['value' => 18.4, 'unit' => 'kg', 'date' => Carbon::today()->subMonth()->format('Y-m-d')],
            'expense' => ['amount' => 145.0, 'date' => Carbon::today()->subMonth()->format('Y-m-d')],
            'clinic' => ['name' => 'Happy Paws Vet', 'phone' => '555-1234'],
            'set_title' => true,
            'set_category' => true,
        ];
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    public function test_applies_a_full_extraction(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $doc = $this->extractedDocument($token, $pet);

        $result = $this->withToken($token)
            ->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", $this->fullPayload())
            ->assertOk()->json();

        // Vaccinations: administered → completed; future due gets a reminder.
        $this->assertCount(2, $result['vaccinations']);
        $rabies = Vaccination::where('pet_id', $pet->id)->where('name', 'Rabies')->first();
        $this->assertSame('completed', $rabies->status);
        $this->assertSame(1, Reminder::where('related_type', 'vaccination')->where('related_id', $rabies->id)->count());
        // DHPP had no next due — administered date reused, no reminder.
        $dhpp = Vaccination::where('pet_id', $pet->id)->where('name', 'DHPP')->first();
        $this->assertSame($dhpp->administered_date->format('Y-m-d'), $dhpp->due_date->format('Y-m-d'));
        $this->assertSame(0, Reminder::where('related_type', 'vaccination')->where('related_id', $dhpp->id)->count());

        // Medication with dose reminders.
        $med = Medication::where('pet_id', $pet->id)->where('name', 'Simparica')->first();
        $this->assertSame('monthly', $med->frequency);
        $this->assertGreaterThan(0, Reminder::where('related_type', 'medication')->where('related_id', $med->id)->count());

        // Weight log + pet headline weight synced.
        $this->assertSame(18.4, WeightLog::where('pet_id', $pet->id)->first()->weight);
        $this->assertSame(18.4, $pet->fresh()->weight);

        // Expense categorized as vet.
        $this->assertSame('vet', Expense::where('pet_id', $pet->id)->first()->category);

        // Clinic created and linked to the document.
        $clinic = Clinic::where('pet_id', $pet->id)->where('name', 'Happy Paws Vet')->first();
        $this->assertSame($clinic->id, $doc->fresh()->clinic_id);

        // Document adopted the suggested title/category and recorded the apply.
        $fresh = $doc->fresh();
        $this->assertSame('Rabies shot — Happy Paws', $fresh->title);
        $this->assertSame('vaccination', $fresh->category);
        $this->assertNotNull($fresh->extraction['_applied_at']);
        $this->assertSame([], $result['skipped']);
    }

    // ── Idempotency ──────────────────────────────────────────────────────────

    public function test_applying_twice_creates_no_duplicates(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $doc = $this->extractedDocument($token, $pet);

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", $this->fullPayload())->assertOk();
        $second = $this->withToken($token)
            ->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", $this->fullPayload())
            ->assertOk()->json();

        $this->assertSame(2, Vaccination::where('pet_id', $pet->id)->count());
        $this->assertSame(1, Medication::where('pet_id', $pet->id)->count());
        $this->assertSame(1, WeightLog::where('pet_id', $pet->id)->count());
        $this->assertSame(1, Expense::where('pet_id', $pet->id)->count());
        $this->assertSame(1, Clinic::where('pet_id', $pet->id)->count());

        // Everything reported as skipped, nothing newly created.
        $this->assertCount(0, $second['vaccinations']);
        $this->assertCount(5, $second['skipped']); // 2 vax + 1 med + 1 weight + 1 expense
    }

    // ── Guards ───────────────────────────────────────────────────────────────

    public function test_apply_requires_a_completed_extraction(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json('id');

        $this->withToken($token)
            ->postJson("/pets/{$pet->id}/documents/{$docId}/apply", $this->fullPayload())
            ->assertStatus(409);
        $this->assertSame(0, Vaccination::where('pet_id', $pet->id)->count());
    }

    public function test_an_outsider_cannot_apply(): void
    {
        Storage::fake('local');
        [$owner, $ownerToken] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);
        $doc = $this->extractedDocument($ownerToken, $pet);

        $this->withToken($outsiderToken)
            ->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", $this->fullPayload())
            ->assertNotFound();
        $this->assertSame(0, Vaccination::where('pet_id', $pet->id)->count());
    }

    public function test_smuggled_pet_id_is_ignored(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        [$victim] = $this->user();
        $pet = $this->pet($owner);
        $victimPet = $this->pet($victim);
        $doc = $this->extractedDocument($token, $pet);

        $payload = $this->fullPayload();
        $payload['vaccinations'][0]['pet_id'] = $victimPet->id; // not in the allowlist
        $payload['pet_id'] = $victimPet->id;

        $this->withToken($token)
            ->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", $payload)
            ->assertOk();

        $this->assertSame(0, Vaccination::where('pet_id', $victimPet->id)->count());
        $this->assertSame(2, Vaccination::where('pet_id', $pet->id)->count());
    }

    // ── Unit conversion ──────────────────────────────────────────────────────

    public function test_weight_is_converted_to_the_pets_unit(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner); // weight_unit kg
        $doc = $this->extractedDocument($token, $pet);

        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$doc->id}/apply", [
            'weight' => ['value' => 40, 'unit' => 'lb', 'date' => Carbon::today()->format('Y-m-d')],
        ])->assertOk();

        $log = WeightLog::where('pet_id', $pet->id)->first();
        $this->assertSame('kg', $log->unit);
        $this->assertSame(18.14, $log->weight); // 40 lb → 18.14 kg
    }
}
