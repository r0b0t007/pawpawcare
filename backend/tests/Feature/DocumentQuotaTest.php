<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Per-account document quota (security audit round 2): one account must not
 * grow the documents bucket past the backup budget, which would leave every
 * user's documents out of the nightly backup.
 */
class DocumentQuotaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config([
            'filesystems.uploads.documents_max_mb_per_account' => 1,
            'filesystems.uploads.documents_max_per_account' => 3,
        ]);
    }

    /** @return array{0: User, 1: string} */
    private function user(): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
    }

    private function upload(string $token, Pet $pet, int $kb)
    {
        return $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->createWithContent('lab.pdf', "%PDF-1.4\n".str_repeat('x', $kb * 1024)),
            'title' => 'Lab',
        ], ['Accept' => 'application/json']);
    }

    public function test_an_upload_past_the_byte_quota_is_refused_and_its_file_removed(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->upload($token, $pet, 600)->assertCreated();
        $this->upload($token, $pet, 600)
            ->assertStatus(422)
            ->assertJsonPath('detail', 'Document storage is full. Delete some documents to upload more.');

        $this->assertSame(1, Document::count());
        // Only the accepted upload's file is left on the private disk.
        $this->assertCount(1, Storage::disk('local')->allFiles('documents'));
    }

    public function test_an_upload_past_the_count_quota_is_refused(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        foreach (range(1, 3) as $_) {
            $this->upload($token, $pet, 1)->assertCreated();
        }
        $this->upload($token, $pet, 1)->assertStatus(422);
        $this->assertSame(3, Document::count());
    }

    public function test_deleting_a_document_frees_its_space(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $id = $this->upload($token, $pet, 600)->assertCreated()->json('id');
        $this->upload($token, $pet, 600)->assertStatus(422);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/documents/{$id}")->assertNoContent();
        $this->upload($token, $pet, 600)->assertCreated();
    }

    public function test_the_quota_spans_every_pet_the_account_owns(): void
    {
        [$owner, $token] = $this->user();

        $this->upload($token, $this->pet($owner), 600)->assertCreated();
        $this->upload($token, $this->pet($owner), 600)->assertStatus(422);
    }

    public function test_a_full_account_does_not_limit_anyone_else(): void
    {
        [$attacker, $attackerToken] = $this->user();
        [$victim, $victimToken] = $this->user();

        $this->upload($attackerToken, $this->pet($attacker), 900)->assertCreated();
        $this->upload($attackerToken, $this->pet($attacker), 200)->assertStatus(422);

        $this->upload($victimToken, $this->pet($victim), 900)->assertCreated();
    }

    public function test_a_co_owners_uploads_count_against_the_pets_owner(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $shared = $this->pet($owner);
        $shared->members()->attach($member->id, ['role' => 'member', 'created_at' => now()]);

        $this->upload($memberToken, $shared, 600)->assertCreated();
        // The owner's quota is now used by the co-owner's upload...
        $this->upload($ownerToken, $shared, 600)->assertStatus(422);
        // ...while the co-owner's own account still has all of its own.
        $this->upload($memberToken, $this->pet($member), 900)->assertCreated();
    }

    public function test_an_empty_or_zero_setting_falls_back_to_the_default(): void
    {
        foreach (['' => 500, '0' => 500, '7' => 7] as $value => $expected) {
            $value = (string) $value;
            putenv("DOCUMENTS_MAX_PER_ACCOUNT={$value}");
            $_ENV['DOCUMENTS_MAX_PER_ACCOUNT'] = $_SERVER['DOCUMENTS_MAX_PER_ACCOUNT'] = $value;
            try {
                $uploads = (require config_path('filesystems.php'))['uploads'];
            } finally {
                putenv('DOCUMENTS_MAX_PER_ACCOUNT');
                unset($_ENV['DOCUMENTS_MAX_PER_ACCOUNT'], $_SERVER['DOCUMENTS_MAX_PER_ACCOUNT']);
            }
            $this->assertSame($expected, $uploads['documents_max_per_account'], "value '{$value}'");
        }
    }

    public function test_the_refusal_is_in_the_users_language(): void
    {
        [$owner, $token] = $this->user();
        $owner->forceFill(['locale' => 'fr'])->save();
        $pet = $this->pet($owner);

        $this->upload($token, $pet, 1100)
            ->assertStatus(422)
            ->assertJsonPath('detail', "L'espace de stockage des documents est plein. Supprimez des documents pour en ajouter d'autres.");
    }
}
