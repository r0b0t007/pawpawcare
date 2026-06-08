<?php

namespace Tests\Feature;

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

    private function token(): string
    {
        $u = User::create([
            'name' => 'U',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return JwtService::createAccessToken($u->id);
    }

    public function test_uploads_an_image_and_returns_a_relative_url(): void
    {
        Storage::fake('public');

        $res = $this->withToken($this->token())->post('/uploads', [
            'file' => UploadedFile::fake()->create('pet.jpg', 200, 'image/jpeg'),
        ])->assertCreated();

        $url = $res->json('url');
        $this->assertStringStartsWith('/storage/uploads/', $url);
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $url));
    }

    public function test_rejects_a_non_image_file(): void
    {
        Storage::fake('public');

        $this->withToken($this->token())->post('/uploads', [
            'file' => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'),
        ])->assertStatus(422);
    }

    public function test_requires_authentication(): void
    {
        Storage::fake('public');

        $this->post('/uploads', [
            'file' => UploadedFile::fake()->create('pet.jpg', 10, 'image/jpeg'),
        ])->assertStatus(401);
    }
}
