<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Pet;
use App\Models\Post;
use App\Models\Upload;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Mockery;
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

    public function test_the_media_host_is_never_an_external_image_host_even_before_the_move(): void
    {
        // Local disks, no MEDIA_URL: what production runs until the switch.
        [, $token] = $this->user();
        $name = str_repeat('a', 40).'.jpg';

        foreach ([
            "https://media.pawpawcare.app/uploads/{$name}",   // pre-staging someone's future R2 url
            "https://MEDIA.pawpawcare.app/uploads/{$name}",   // case lookalike
            "https://media.pawpawcare.app:443/uploads/{$name}?x=1",
            'https://media.pawpawcare.app./anything.jpg',
        ] as $url) {
            $this->withToken($token)->patchJson('/users/me', ['avatar_url' => $url])->assertStatus(422);
        }

        $this->withToken($token)->patchJson('/users/me', ['avatar_url' => 'https://media.pawpawcare.app.example.org/x.jpg'])->assertOk();
    }

    public function test_urls_that_parse_two_ways_are_refused(): void
    {
        [, $token] = $this->user();
        $name = str_repeat('a', 40).'.jpg';

        // Browsers fold each of these into media.pawpawcare.app; parse_url doesn't.
        foreach ([
            "https://media.pawpawcare.app\\uploads\\{$name}",
            "https://media.pawpaw\tcare.app/uploads/{$name}",
            "https://media%2Epawpawcare.app/uploads/{$name}",
            "https://media\u{3002}pawpawcare\u{3002}app/uploads/{$name}",
        ] as $url) {
            $this->withToken($token)->patchJson('/users/me', ['avatar_url' => $url])->assertStatus(422);
        }
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
        $this->assertSame('private, no-store', $q['ResponseCacheControl']);

        // The signature still guards the door.
        $this->get($signed.'tampered')->assertStatus(403);
    }

    public function test_an_r2_error_deleting_a_document_file_does_not_abort_the_pet_delete(): void
    {
        $this->onR2();
        Exceptions::fake();
        [$owner, $token] = $this->user();
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        Document::create(['pet_id' => $pet->id, 'title' => 'A', 'file_path' => 'documents/a.pdf', 'mime' => 'application/pdf', 'size_bytes' => 1]);
        Document::create(['pet_id' => $pet->id, 'title' => 'B', 'file_path' => 'documents/b.pdf', 'mime' => 'application/pdf', 'size_bytes' => 1]);

        $failing = Mockery::mock(Filesystem::class);
        $failing->shouldReceive('delete')->twice()->andThrow(new \RuntimeException('R2 timed out'));
        Storage::set('r2-documents', $failing);

        $this->withToken($token)->deleteJson("/pets/{$pet->id}")->assertSuccessful();

        $this->assertNull(Pet::find($pet->id));
        Exceptions::assertReported(fn (\RuntimeException $e) => $e->getMessage() === 'R2 timed out');
    }

    // ── uploads:prune on R2 ──────────────────────────────────────────────────

    public function test_prune_keeps_images_in_use_even_if_media_url_changes(): void
    {
        $this->onR2();
        [$user] = $this->user();
        $used = 'uploads/'.str_repeat('u', 40).'.jpg';
        $orphan = 'uploads/'.str_repeat('o', 40).'.jpg';
        Storage::disk('r2-media')->put($used, 'x');
        Storage::disk('r2-media')->put($orphan, 'y');
        Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => self::MEDIA.'/'.$used]);

        config(['filesystems.disks.r2-media.url' => 'https://img.pawpawcare.app']);
        $this->artisan('uploads:prune', ['--hours' => 0])->assertSuccessful();

        Storage::disk('r2-media')->assertExists($used);
        Storage::disk('r2-media')->assertMissing($orphan);
    }

    public function test_an_external_url_ending_in_someones_file_name_does_not_keep_it(): void
    {
        $this->onR2();
        [$user] = $this->user();
        $orphan = 'uploads/'.str_repeat('o', 40).'.jpg';
        Storage::disk('r2-media')->put($orphan, 'y');
        Pet::create(['owner_id' => $user->id, 'name' => 'P', 'avatar_url' => 'https://a.example/'.$orphan]);

        $this->artisan('uploads:prune', ['--hours' => 0])->assertSuccessful();

        Storage::disk('r2-media')->assertMissing($orphan);
    }

    public function test_one_failing_file_does_not_stop_the_prune(): void
    {
        $this->onR2();
        Exceptions::fake();
        [$bad, $good] = ['uploads/'.str_repeat('b', 40).'.jpg', 'uploads/'.str_repeat('g', 40).'.jpg'];
        $media = Mockery::mock(Filesystem::class);
        $media->shouldReceive('files')->with('uploads')->andReturn([$bad, $good]);
        $media->shouldReceive('lastModified')->with($bad)->andThrow(new \RuntimeException('R2 500'));
        $media->shouldReceive('lastModified')->with($good)->andReturn(0);
        $media->shouldReceive('delete')->with($good)->once();
        Storage::set('r2-media', $media);
        Storage::disk('r2-documents')->put('documents/'.str_repeat('d', 40).'.pdf', 'x');

        $this->artisan('uploads:prune', ['--hours' => 0])->expectsOutputToContain('Pruned 2 orphaned file(s).')->assertSuccessful();

        Exceptions::assertReported(fn (\RuntimeException $e) => $e->getMessage() === 'R2 500');
        $this->assertSame([], Storage::disk('r2-documents')->allFiles());
    }

    public function test_prune_refuses_to_run_on_r2_without_media_url(): void
    {
        $this->onR2();
        config(['filesystems.disks.r2-media.url' => null]);
        Storage::disk('r2-media')->put('uploads/'.str_repeat('o', 40).'.jpg', 'y');

        $this->artisan('uploads:prune', ['--hours' => 0])->expectsOutputToContain('Not pruning: MEDIA_URL must be set')->assertFailed();

        Storage::disk('r2-media')->assertExists('uploads/'.str_repeat('o', 40).'.jpg');
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

    public function test_migrate_keeps_a_local_file_a_record_still_reaches_through_storage(): void
    {
        [$user] = $this->user();
        $img = 'uploads/'.str_repeat('a', 40).'.jpg';
        Storage::disk('public')->put($img, 'jpeg-bytes');
        // Accepted as "external" before this change; the rewrite doesn't touch it.
        DB::table('users')->where('id', $user->id)->update(['avatar_url' => 'https://api.pawpawcare.app/storage/'.$img]);
        $this->onR2();

        $this->artisan('uploads:migrate')->expectsOutputToContain('Kept 1 local file(s)')->assertSuccessful();

        Storage::disk('r2-media')->assertExists($img);
        Storage::disk('public')->assertExists($img);
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
