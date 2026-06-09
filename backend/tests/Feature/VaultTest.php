<?php

namespace Tests\Feature;

use App\Models\Clinic;
use App\Models\Document;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VaultTest extends TestCase
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

    // ── Clinics ──────────────────────────────────────────────────────────────

    public function test_clinic_crud(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $clinic = $this->withToken($token)->postJson("/pets/{$pet->id}/clinics", [
            'name' => 'Happy Paws Vet', 'phone' => '555-1234', 'email' => 'vet@example.com',
        ])->assertCreated()->json();
        $this->assertSame('Happy Paws Vet', $clinic['name']);

        $this->withToken($token)->patchJson("/pets/{$pet->id}/clinics/{$clinic['id']}", [
            'vet_name' => 'Dr. Meow',
        ])->assertOk()->assertJsonPath('vet_name', 'Dr. Meow');

        $this->withToken($token)->getJson("/pets/{$pet->id}/clinics")->assertOk()->assertJsonCount(1);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/clinics/{$clinic['id']}")->assertNoContent();
        $this->withToken($token)->getJson("/pets/{$pet->id}/clinics")->assertJsonCount(0);
    }

    // ── Appointments ─────────────────────────────────────────────────────────

    public function test_appointment_crud_and_clinic_link(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $clinicId = $this->withToken($token)->postJson("/pets/{$pet->id}/clinics", ['name' => 'Clinic A'])->json('id');

        $appt = $this->withToken($token)->postJson("/pets/{$pet->id}/appointments", [
            'title' => 'Annual checkup',
            'scheduled_at' => '2026-12-01T09:00:00Z',
            'clinic_id' => $clinicId,
        ])->assertCreated()->json();

        $this->assertSame('scheduled', $appt['status']);
        $this->assertSame('Clinic A', $appt['clinic_name']);

        $this->withToken($token)->patchJson("/pets/{$pet->id}/appointments/{$appt['id']}", [
            'status' => 'completed',
        ])->assertOk()->assertJsonPath('status', 'completed');

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/appointments/{$appt['id']}")->assertNoContent();
    }

    public function test_appointment_rejects_a_clinic_from_another_pet(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $otherPet = $this->pet($owner);
        $otherClinicId = $this->withToken($token)->postJson("/pets/{$otherPet->id}/clinics", ['name' => 'X'])->json('id');

        $this->withToken($token)->postJson("/pets/{$pet->id}/appointments", [
            'title' => 'Visit', 'scheduled_at' => '2026-12-01T09:00:00Z', 'clinic_id' => $otherClinicId,
        ])->assertStatus(422);
    }

    // ── Documents ────────────────────────────────────────────────────────────

    public function test_uploads_an_image_document_and_lists_it(): void
    {
        Storage::fake('public');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('lab.jpg', 200, 200),
            'title' => 'Bloodwork',
            'category' => 'lab',
        ])->assertCreated()->json();

        $this->assertSame('lab', $doc['category']);
        $this->assertStringStartsWith('/storage/documents/', $doc['file_url']);
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $doc['file_url']));

        $this->withToken($token)->getJson("/pets/{$pet->id}/documents")->assertOk()->assertJsonCount(1);
    }

    public function test_uploads_a_pdf_document(): void
    {
        Storage::fake('public');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        // A real PDF starts with the %PDF- magic bytes.
        $pdf = UploadedFile::fake()->createWithContent('record.pdf', "%PDF-1.4\n%fake body\n%%EOF");

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => $pdf,
            'title' => 'Discharge notes',
        ])->assertCreated()->json();

        $this->assertSame('application/pdf', $doc['mime']);
        $this->assertStringEndsWith('.pdf', $doc['file_url']);
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $doc['file_url']));
    }

    public function test_rejects_a_disallowed_file_type(): void
    {
        Storage::fake('public');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->create('virus.exe', 10, 'application/octet-stream'),
            'title' => 'Nope',
        ])->assertStatus(422);
    }

    public function test_deleting_a_document_removes_its_file(): void
    {
        Storage::fake('public');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json();
        $path = str_replace('/storage/', '', $doc['file_url']);
        Storage::disk('public')->assertExists($path);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/documents/{$doc['id']}")->assertNoContent();
        Storage::disk('public')->assertMissing($path);
    }

    public function test_deleting_a_pet_removes_its_document_files(): void
    {
        Storage::fake('public');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json();
        $path = str_replace('/storage/', '', $doc['file_url']);

        $pet->delete();

        Storage::disk('public')->assertMissing($path);
        $this->assertSame(0, Document::where('pet_id', $pet->id)->count());
    }

    // ── Access scoping ───────────────────────────────────────────────────────

    public function test_records_are_access_scoped(): void
    {
        Storage::fake('public');
        [$owner, $ownerToken] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/clinics")->assertNotFound();
        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/appointments")->assertNotFound();
        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/documents")->assertNotFound();
        $this->withToken($outsiderToken)->postJson("/pets/{$pet->id}/clinics", ['name' => 'X'])->assertNotFound();
    }

    public function test_a_co_owner_can_use_the_vault(): void
    {
        Storage::fake('public');
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = $this->pet($owner);

        // Share the pet (invite + accept).
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $member->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;
        $this->withToken($memberToken)->postJson("/invites/{$inviteId}/accept")->assertOk();

        // The co-owner can read and add records.
        $this->withToken($memberToken)->getJson("/pets/{$pet->id}/clinics")->assertOk();
        $this->withToken($memberToken)->postJson("/pets/{$pet->id}/clinics", ['name' => 'Shared Vet'])->assertCreated();
        $this->assertSame(1, Clinic::where('pet_id', $pet->id)->count());
    }
}
