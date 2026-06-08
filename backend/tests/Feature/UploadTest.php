<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\Post;
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

    public function test_replacing_a_pet_avatar_deletes_the_old_file(): void
    {
        Storage::fake('public');
        [$user, $token] = $this->user();
        Storage::disk('public')->put('uploads/old.jpg', 'x');
        Storage::disk('public')->put('uploads/new.jpg', 'y');

        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/uploads/old.jpg']);

        $this->withToken($token)->patchJson("/pets/{$pet->id}", [
            'avatar_url' => '/storage/uploads/new.jpg',
        ])->assertOk();

        Storage::disk('public')->assertMissing('uploads/old.jpg');
        Storage::disk('public')->assertExists('uploads/new.jpg');
    }

    public function test_deleting_a_post_removes_its_image_file(): void
    {
        Storage::fake('public');
        [$user, $token] = $this->user();
        Storage::disk('public')->put('uploads/img.jpg', 'x');

        $post = Post::create(['author_id' => $user->id, 'content' => 'hi', 'image_url' => '/storage/uploads/img.jpg']);

        $this->withToken($token)->deleteJson("/community/posts/{$post->id}")->assertNoContent();

        Storage::disk('public')->assertMissing('uploads/img.jpg');
    }

    public function test_prune_removes_unreferenced_files_but_keeps_referenced_ones(): void
    {
        Storage::fake('public');
        [$user] = $this->user();
        $disk = Storage::disk('public');

        $disk->put('uploads/keep.jpg', 'x');
        Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/uploads/keep.jpg']);
        $disk->put('uploads/orphan.jpg', 'y');

        $this->artisan('uploads:prune', ['--hours' => 0])->assertExitCode(0);

        $disk->assertExists('uploads/keep.jpg');
        $disk->assertMissing('uploads/orphan.jpg');
    }
}
