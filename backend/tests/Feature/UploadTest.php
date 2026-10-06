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

class UploadTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_uploads_an_image_and_returns_a_relative_url(): void
    {
        Storage::fake('public');
        [, $token] = $this->user();

        $res = $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->image('pet.jpg', 120, 120),
        ])->assertCreated();

        $url = $res->json('url');
        $this->assertStringStartsWith('/storage/uploads/', $url);
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $url));
    }

    public function test_rejects_a_non_image_file(): void
    {
        Storage::fake('public');
        [, $token] = $this->user();

        $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'),
        ])->assertStatus(422);
    }

    public function test_rejects_an_oversized_image(): void
    {
        Storage::fake('public');
        [, $token] = $this->user();

        $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->image('big.jpg')->size(6000), // 6 MB > 5 MB cap
        ])->assertStatus(422);
    }

    public function test_requires_authentication(): void
    {
        Storage::fake('public');

        $this->post('/uploads', [
            'file' => UploadedFile::fake()->image('pet.jpg'),
        ])->assertStatus(401);
    }

    /** Upload an image as the token's user; returns its /storage/... url. */
    private function upload(string $token): string
    {
        return $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->image('pet.jpg', 40, 40),
        ])->assertCreated()->json('url');
    }

    private function diskPath(string $url): string
    {
        return substr($url, strlen('/storage/'));
    }

    public function test_replacing_a_pet_avatar_deletes_the_old_file(): void
    {
        Storage::fake('public');
        [, $token] = $this->user();
        $old = $this->upload($token);
        $new = $this->upload($token);

        $petId = $this->withToken($token)->postJson('/pets', ['name' => 'P', 'avatar_url' => $old])
            ->assertCreated()->json('id');

        $this->withToken($token)->patchJson("/pets/{$petId}", ['avatar_url' => $new])->assertOk();

        Storage::disk('public')->assertMissing($this->diskPath($old));
        Storage::disk('public')->assertExists($this->diskPath($new));
    }

    public function test_deleting_a_post_removes_its_image_file(): void
    {
        Storage::fake('public');
        [, $token] = $this->user();
        $img = $this->upload($token);

        $postId = $this->withToken($token)->postJson('/community/posts', ['content' => 'hi', 'image_url' => $img])
            ->assertCreated()->json('id');

        $this->withToken($token)->deleteJson("/community/posts/{$postId}")->assertNoContent();

        Storage::disk('public')->assertMissing($this->diskPath($img));
    }

    public function test_prune_removes_unreferenced_files_but_keeps_referenced_ones(): void
    {
        Storage::fake('public');
        [$user] = $this->user();
        $disk = Storage::disk('public');

        // Names in the shape storeImage() generates (40 random chars).
        $keep = 'uploads/'.str_repeat('k', 40).'.jpg';
        $orphan = 'uploads/'.str_repeat('o', 40).'.jpg';
        $disk->put($keep, 'x');
        Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/'.$keep]);
        $disk->put($orphan, 'y');

        $this->artisan('uploads:prune', ['--hours' => 0])->assertExitCode(0);

        $disk->assertExists($keep);
        $disk->assertMissing($orphan);
    }

    public function test_prune_keeps_referenced_legacy_hashname_uploads(): void
    {
        // Pre-GD uploads were named by Laravel's hashName(): 40 random chars
        // plus the guessed extension, which wasn't always jpg/png/webp/gif.
        Storage::fake('public');
        [$user] = $this->user();
        $disk = Storage::disk('public');

        $jpeg = 'uploads/'.str_repeat('J', 40).'.jpeg';
        $bmp = 'uploads/'.str_repeat('B', 40).'.bmp';
        $disk->put($jpeg, 'x');
        $disk->put($bmp, 'y');
        Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/'.$jpeg]);
        $user->forceFill(['avatar_url' => '/storage/'.$bmp])->save();

        $this->artisan('uploads:prune', ['--hours' => 0])->assertExitCode(0);

        $disk->assertExists($jpeg);
        $disk->assertExists($bmp);
    }
}
