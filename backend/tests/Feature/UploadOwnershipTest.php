<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * A record may only point at an upload its owner made, and cleanup only
 * deletes a file once nothing references it — so no user can delete another
 * user's photo by copying its /storage URL into their own post or avatar.
 */
class UploadOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
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

    private function upload(string $token): string
    {
        return $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->image('pet.jpg', 40, 40),
        ])->assertCreated()->json('url');
    }

    private function assertFileKept(string $url): void
    {
        Storage::disk('public')->assertExists(substr($url, strlen('/storage/')));
    }

    public function test_cannot_attach_another_users_upload_anywhere(): void
    {
        [$victim, $victimToken] = $this->user();
        [$attacker, $attackerToken] = $this->user();
        $victimFile = $this->upload($victimToken);
        $pet = Pet::create(['owner_id' => $attacker->id, 'name' => 'Decoy']);

        $this->withToken($attackerToken)->postJson('/community/posts', ['content' => 'x', 'image_url' => $victimFile])
            ->assertStatus(422);
        $this->withToken($attackerToken)->patchJson('/users/me', ['avatar_url' => $victimFile])
            ->assertStatus(422);
        $this->withToken($attackerToken)->postJson('/pets', ['name' => 'P', 'avatar_url' => $victimFile])
            ->assertStatus(422);
        $this->withToken($attackerToken)->patchJson("/pets/{$pet->id}", ['avatar_url' => $victimFile])
            ->assertStatus(422);
        $this->withToken($attackerToken)->postJson("/pets/{$pet->id}/lost-report", ['photo_url' => $victimFile])
            ->assertStatus(422);

        $this->assertFileKept($victimFile);
    }

    public function test_hand_written_and_traversal_shaped_paths_are_rejected(): void
    {
        [, $token] = $this->user();

        foreach (['/storage/../x', '/storage/uploads/whatever.jpg', '/etc/passwd'] as $bad) {
            $this->withToken($token)->postJson('/community/posts', ['content' => 'x', 'image_url' => $bad])
                ->assertStatus(422);
        }
    }

    public function test_external_urls_and_unchanged_legacy_values_still_work(): void
    {
        [$user, $token] = $this->user();
        $this->withToken($token)->postJson('/community/posts', ['content' => 'x', 'image_url' => 'https://example.com/a.png'])
            ->assertCreated();

        // A value set before ownership was tracked can be re-sent unchanged.
        $user->forceFill(['avatar_url' => '/storage/uploads/'.str_repeat('a', 40).'.jpg'])->save();
        $this->withToken($token)->patchJson('/users/me', ['avatar_url' => $user->avatar_url, 'bio' => 'hi'])
            ->assertOk();
    }

    public function test_a_co_owner_can_set_the_shared_pet_photo_from_their_upload(): void
    {
        [$owner] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna']);
        $pet->members()->attach($member->id, ['role' => 'member', 'created_at' => now()]);

        $this->withToken($memberToken)->patchJson("/pets/{$pet->id}", ['avatar_url' => $this->upload($memberToken)])
            ->assertOk();
    }

    public function test_a_file_still_used_elsewhere_is_not_deleted(): void
    {
        [, $token] = $this->user();
        $img = $this->upload($token);

        $postId = $this->withToken($token)->postJson('/community/posts', ['content' => 'x', 'image_url' => $img])
            ->assertCreated()->json('id');
        $this->withToken($token)->patchJson('/users/me', ['avatar_url' => $img])->assertOk();

        $this->withToken($token)->deleteJson("/community/posts/{$postId}")->assertNoContent();

        $this->assertFileKept($img); // still the avatar
    }

    public function test_the_account_purge_removes_the_users_avatar_file(): void
    {
        [$user, $token] = $this->user();
        $avatar = $this->upload($token);
        $this->withToken($token)->patchJson('/users/me', ['avatar_url' => $avatar])->assertOk();
        $user->forceFill(['is_active' => false, 'deletion_requested_at' => now()->subDays(31)])->save();

        $this->artisan('accounts:purge-deleted')->assertExitCode(0);

        $this->assertNull(User::find($user->id));
        Storage::disk('public')->assertMissing(substr($avatar, strlen('/storage/')));
    }

    public function test_a_malformed_stored_url_never_blocks_deletes(): void
    {
        // Rows written before validation tightened may hold any string.
        [$user, $token] = $this->user();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/../x']);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}")->assertNoContent();
        $this->assertNull(Pet::find($pet->id));
    }
}
