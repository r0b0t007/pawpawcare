<?php

namespace Tests\Feature;

use App\Models\Appointment;
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

    // ── Links cleared on delete (nullOnDelete) ───────────────────────────────

    public function test_deleting_a_clinic_unlinks_appointments_and_documents(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $clinicId = $this->withToken($token)->postJson("/pets/{$pet->id}/clinics", ['name' => 'Clinic'])->json('id');
        $apptId = $this->withToken($token)->postJson("/pets/{$pet->id}/appointments", [
            'title' => 'Visit', 'scheduled_at' => '2026-12-01T09:00:00Z', 'clinic_id' => $clinicId,
        ])->json('id');
        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X', 'clinic_id' => $clinicId,
        ])->json('id');

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/clinics/{$clinicId}")->assertNoContent();

        // The records survive, but their clinic link is cleared.
        $this->assertNull(Appointment::find($apptId)->clinic_id);
        $this->assertNull(Document::find($docId)->clinic_id);
    }

    public function test_deleting_an_appointment_unlinks_its_documents(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $apptId = $this->withToken($token)->postJson("/pets/{$pet->id}/appointments", [
            'title' => 'Visit', 'scheduled_at' => '2026-12-01T09:00:00Z',
        ])->json('id');
        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X', 'appointment_id' => $apptId,
        ])->json('id');

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/appointments/{$apptId}")->assertNoContent();

        $this->assertNull(Document::find($docId)->appointment_id);
    }

    // ── Documents (private disk) ─────────────────────────────────────────────

    public function test_uploads_an_image_document_and_lists_it(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('lab.jpg', 200, 200),
            'title' => 'Bloodwork',
            'category' => 'lab',
        ])->assertCreated()->json();

        $this->assertSame('lab', $doc['category']);
        // The raw path is never exposed to the client.
        $this->assertArrayNotHasKey('file_path', $doc);
        $this->assertArrayNotHasKey('file_url', $doc);

        $path = Document::find($doc['id'])->file_path;
        $this->assertStringStartsWith('documents/', $path);
        Storage::disk('local')->assertExists($path);
        $this->assertGreaterThan(0, $doc['size_bytes']);

        $this->withToken($token)->getJson("/pets/{$pet->id}/documents")->assertOk()->assertJsonCount(1);
    }

    public function test_uploads_a_pdf_document(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        // A real PDF starts with the %PDF- magic bytes.
        $pdf = UploadedFile::fake()->createWithContent('record.pdf', "%PDF-1.4\n%fake body\n%%EOF");

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => $pdf,
            'title' => 'Discharge notes',
        ])->assertCreated()->json();

        $this->assertSame('application/pdf', $doc['mime']);
        $path = Document::find($doc['id'])->file_path;
        $this->assertStringEndsWith('.pdf', $path);
        Storage::disk('local')->assertExists($path);
    }

    public function test_rejects_a_disallowed_file_type(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->create('virus.exe', 10, 'application/octet-stream'),
            'title' => 'Nope',
        ])->assertStatus(422);
    }

    public function test_deleting_a_document_removes_its_file(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json();
        $path = Document::find($doc['id'])->file_path;
        Storage::disk('local')->assertExists($path);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/documents/{$doc['id']}")->assertNoContent();
        Storage::disk('local')->assertMissing($path);
    }

    public function test_deleting_a_pet_removes_its_document_files(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $doc = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json();
        $path = Document::find($doc['id'])->file_path;

        $pet->delete();

        Storage::disk('local')->assertMissing($path);
        $this->assertSame(0, Document::where('pet_id', $pet->id)->count());
    }

    // ── Signed document delivery ─────────────────────────────────────────────

    public function test_signed_url_serves_the_file_and_rejects_tampering(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json('id');

        $url = $this->withToken($token)->getJson("/pets/{$pet->id}/documents/{$docId}/url")
            ->assertOk()->json('url');
        $this->assertStringContainsString('signature=', $url);

        // A valid signed URL streams the file.
        $this->get($url)->assertOk();

        // Tampering with the signature is rejected.
        $this->get($url.'tampered')->assertStatus(403);
    }

    public function test_signed_url_expires(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json('id');
        $url = $this->withToken($token)->getJson("/pets/{$pet->id}/documents/{$docId}/url")->json('url');

        $this->travel(6)->minutes(); // links live for 5

        $this->get($url)->assertStatus(403);
    }

    public function test_non_member_cannot_mint_a_document_url(): void
    {
        Storage::fake('local');
        [$owner, $ownerToken] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->withToken($ownerToken)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('x.jpg'), 'title' => 'X',
        ])->json('id');

        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/documents/{$docId}/url")->assertNotFound();
    }

    // ── Access scoping ───────────────────────────────────────────────────────

    public function test_records_are_access_scoped(): void
    {
        Storage::fake('local');
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
        Storage::fake('local');
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
