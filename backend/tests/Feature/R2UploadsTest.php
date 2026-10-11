<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\Post;
use App\Models\Upload;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Uploads on the R2 disks (faked locally), the migration to them, and the deploy check. */
class R2UploadsTest extends TestCase
{
    use RefreshDatabase;

    private const MEDIA = 'https://media.pawpawcare.app';

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['public', 'local', 'r2-media', 'r2-documents'] as $disk) {
            Storage::fake($disk);
        }
        // A fake disk can't presign; this stands in for R2's signed S3 URLs.
        Storage::disk('r2-documents')->buildTemporaryUrlsUsing(
            fn (string $path, $expiration, array $options) => 'https://r2.test/'.$path.'?'.http_build_query($options + ['X-Amz-Signature' => 'sig']),
        );
    }

    private function onR2(): void
    {
        config([
            'filesystems.uploads.public_disk' => 'r2-media',
            'filesystems.uploads.private_disk' => 'r2-documents',
            'filesystems.disks.r2-media.url' => self::MEDIA,
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

    private function upload(string $token): string
    {
        return $this->withToken($token)->post('/uploads', [
            'file' => UploadedFile::fake()->image('pet.jpg', 40, 40),
        ])->assertCreated()->json('url');
    }

    private function mediaPath(string $url): string
    {
        return substr($url, strlen(self::MEDIA.'/'));
    }

    // ── Public images ────────────────────────────────────────────────────────

    public function test_an_image_upload_lands_on_r2_with_an_absolute_media_url(): void
    {
        $this->onR2();
        [, $token] = $this->user();

        $url = $this->upload($token);

        $this->assertMatchesRegularExpression('#^https://media\.pawpawcare\.app/uploads/[A-Za-z0-9]{40}\.jpg$#', $url);
        Storage::disk('r2-media')->assertExists($this->mediaPath($url));
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_without_media_url_an_upload_fails_and_stores_nothing(): void
    {
        $this->onR2();
        config(['filesystems.disks.r2-media.url' => null]);
        [, $token] = $this->user();

        $this->withToken($token)->post('/uploads', ['file' => UploadedFile::fake()->image('pet.jpg')])->assertStatus(500);

        $this->assertSame([], Storage::disk('r2-media')->allFiles());
        $this->assertSame(0, Upload::count());
    }

    public function test_replacing_and_deleting_images_removes_them_from_r2(): void
    {
        $this->onR2();
        [, $token] = $this->user();
        [$old, $new, $postImg] = [$this->upload($token), $this->upload($token), $this->upload($token)];

        $petId = $this->withToken($token)->postJson('/pets', ['name' => 'P', 'avatar_url' => $old])->assertCreated()->json('id');
        $this->withToken($token)->patchJson("/pets/{$petId}", ['avatar_url' => $new])->assertOk();
        $postId = $this->withToken($token)->postJson('/community/posts', ['content' => 'hi', 'image_url' => $postImg])->assertCreated()->json('id');
        $this->withToken($token)->deleteJson("/community/posts/{$postId}")->assertNoContent();

        Storage::disk('r2-media')->assertMissing($this->mediaPath($old));
        Storage::disk('r2-media')->assertExists($this->mediaPath($new));
        Storage::disk('r2-media')->assertMissing($this->mediaPath($postImg));
    }

    public function test_an_old_storage_url_sent_back_after_the_move_keeps_the_image(): void
    {
        $this->onR2();
        [, $token] = $this->user();
        $url = $this->upload($token);
        $petId = $this->withToken($token)->postJson('/pets', ['name' => 'P', 'avatar_url' => $url])->json('id');

        // An app that cached the pre-migration value sends it back on an unrelated edit.
        $legacy = '/storage/'.$this->mediaPath($url);
        $this->withToken($token)->patchJson("/pets/{$petId}", ['name' => 'Q', 'avatar_url' => $legacy])
            ->assertOk()->assertJsonPath('avatar_url', $url);

        Storage::disk('r2-media')->assertExists($this->mediaPath($url));
    }

    public function test_another_users_upload_is_rejected_by_its_media_url_too(): void
    {
        $this->onR2();
        [, $mine] = $this->user();
        [, $theirs] = $this->user();
        $theirUrl = $this->upload($theirs);

        $this->withToken($mine)->postJson('/pets', ['name' => 'P', 'avatar_url' => $theirUrl])->assertStatus(422);
        $this->withToken($mine)->patchJson('/users/me', ['avatar_url' => $theirUrl])->assertStatus(422);
        // External images are still fine.
        $this->withToken($mine)->postJson('/pets', ['name' => 'P', 'avatar_url' => 'https://example.org/cat.jpg'])->assertCreated();
    }

    // ── Documents ────────────────────────────────────────────────────────────

    public function test_a_document_lands_on_r2_and_opens_through_a_presigned_redirect(): void
    {
        $this->onR2();
        [$owner, $token] = $this->user();
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);

        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('lab.jpg', 50, 50), 'title' => 'Bloodwork 1/2 – Été',
        ])->assertCreated()->json('id');
        $path = Document::find($docId)->file_path;
        Storage::disk('r2-documents')->assertExists($path);
        $this->assertSame([], Storage::disk('local')->allFiles());

        $signed = $this->withToken($token)->getJson("/pets/{$pet->id}/documents/{$docId}/url")->json('url');
        $res = $this->get($signed)->assertRedirect();

        $location = $res->headers->get('Location');
        $this->assertStringStartsWith("https://r2.test/{$path}?", $location);
        parse_str(parse_url($location, PHP_URL_QUERY), $q);
        $this->assertSame('image/jpeg', $q['ResponseContentType']);
        $this->assertStringStartsWith('inline; filename="Bloodwork 1-2', $q['ResponseContentDisposition']);
        $this->assertStringContainsString("filename*=utf-8''Bloodwork%201-2", $q['ResponseContentDisposition']);
        $this->assertStringContainsString('no-store', $res->headers->get('Cache-Control'));
        $this->assertSame('no-referrer', $res->headers->get('Referrer-Policy'));

        // The signature still guards the door.
        $this->get($signed.'tampered')->assertStatus(403);
    }

    // ── uploads:migrate ──────────────────────────────────────────────────────

    public function test_migrate_moves_local_files_to_r2_and_rewrites_urls(): void
    {
        [$user] = $this->user();
        $img = 'uploads/'.str_repeat('a', 40).'.jpg';
        Storage::disk('public')->put($img, 'jpeg-bytes');
        Storage::disk('local')->put('documents/'.str_repeat('d', 40).'.pdf', '%PDF-1.4');
        Upload::create(['path' => $img, 'user_id' => $user->id]);
        $user->forceFill(['avatar_url' => '/storage/'.$img])->save();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => '/storage/'.$img]);
        $post = Post::create(['author_id' => $user->id, 'content' => 'x', 'image_url' => 'https://example.org/a.jpg']);
        $this->onR2();

        $this->artisan('uploads:migrate', ['--dry-run' => true])->expectsOutputToContain('Would move 2 file(s)')->assertSuccessful();
        Storage::disk('public')->assertExists($img);
        $this->assertSame('/storage/'.$img, DB::table('pets')->where('id', $pet->id)->value('avatar_url'));

        $this->artisan('uploads:migrate')->expectsOutputToContain('Moved 2 file(s) and rewrote 2 stored image url(s)')->assertSuccessful();

        Storage::disk('r2-media')->assertExists($img);
        $this->assertSame('jpeg-bytes', Storage::disk('r2-media')->get($img));
        Storage::disk('r2-documents')->assertExists('documents/'.str_repeat('d', 40).'.pdf');
        $this->assertSame([], Storage::disk('public')->allFiles());
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertSame(self::MEDIA.'/'.$img, $pet->fresh()->avatar_url);
        $this->assertSame(self::MEDIA.'/'.$img, $user->fresh()->avatar_url);
        $this->assertSame('https://example.org/a.jpg', $post->fresh()->image_url);

        $this->artisan('uploads:migrate')->expectsOutputToContain('Moved 0 file(s) and rewrote 0')->assertSuccessful();
    }

    public function test_migrate_does_nothing_on_local_disks_and_refuses_without_media_url(): void
    {
        $this->artisan('uploads:migrate')->expectsOutputToContain('nothing to migrate')->assertSuccessful();

        $this->onR2();
        config(['filesystems.disks.r2-media.url' => '']);
        Storage::disk('public')->put('uploads/'.str_repeat('a', 40).'.jpg', 'x');

        $this->artisan('uploads:migrate')->expectsOutputToContain('MEDIA_URL must be set')->assertFailed();
        Storage::disk('public')->assertExists('uploads/'.str_repeat('a', 40).'.jpg');
    }

    // ── uploads:check ────────────────────────────────────────────────────────

    /** Serves the probe file back the way R2's public domain and presigned URLs would. */
    private function fakeR2Http(int $status = 200): void
    {
        Http::fake(function (HttpRequest $request) use ($status) {
            $url = $request->url();
            [$disk, $prefix] = str_starts_with($url, self::MEDIA) ? ['r2-media', self::MEDIA.'/'] : ['r2-documents', 'https://r2.test/'];
            $path = strtok(substr($url, strlen($prefix)), '?');

            return Http::response($status === 200 ? Storage::disk($disk)->get($path) : 'denied', $status);
        });
    }

    public function test_check_passes_on_local_disks_and_on_working_r2(): void
    {
        $this->artisan('uploads:check')->expectsOutputToContain('Uploads use the local disks.')->assertSuccessful();

        $this->onR2();
        $this->fakeR2Http();
        $this->artisan('uploads:check')
            ->expectsOutputToContain('r2-media: write, read, served from MEDIA_URL and delete OK.')
            ->expectsOutputToContain('r2-documents: write, read, opened through a presigned URL and delete OK.')
            ->assertSuccessful();

        // The probes clean up after themselves.
        $this->assertSame([], Storage::disk('r2-media')->allFiles());
        $this->assertSame([], Storage::disk('r2-documents')->allFiles());
    }

    public function test_check_fails_and_logs_when_media_is_not_publicly_served(): void
    {
        $this->onR2();
        $this->fakeR2Http(403);
        Log::spy();

        $this->artisan('uploads:check')
            ->expectsOutputToContain("Upload storage check failed: r2-media: the test file wasn't served from MEDIA_URL (HTTP 403).")
            ->assertFailed();

        Log::shouldHaveReceived('error')->withArgs(fn ($m) => str_starts_with($m, 'Upload storage check failed:'))->once();
        $this->assertSame([], Storage::disk('r2-media')->allFiles());
    }

    public function test_check_rejects_an_unknown_disk_and_a_plain_http_media_url(): void
    {
        config(['filesystems.uploads.public_disk' => 'r2-medai']);
        $this->artisan('uploads:check')->expectsOutputToContain("must be one of public, r2-media, not 'r2-medai'")->assertFailed();

        $this->onR2();
        config(['filesystems.disks.r2-media.url' => 'http://media.pawpawcare.app']);
        $this->artisan('uploads:check')->expectsOutputToContain('MEDIA_URL must be an https:// address.')->assertFailed();
    }
}
