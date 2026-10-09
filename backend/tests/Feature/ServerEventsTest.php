<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\DocumentExtractor;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Server-side product events: each fires at the real endpoint, carries the
 * user's id plus enums/counts only, and respects analytics_opt_out.
 */
class ServerEventsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.posthog.key' => 'phc_test', 'services.posthog.host' => 'https://us.i.posthog.com']);
        Http::fake(['us.i.posthog.com/*' => Http::response(['status' => 'Ok'])]);
    }

    /** @return array{0: User, 1: string} */
    private function user(array $attrs = []): array
    {
        $u = User::create([
            'name' => 'Sam Owner',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('password1'),
            'timezone' => 'UTC',
        ]);
        $u->forceFill(['email_verified_at' => now()] + $attrs)->save();

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner, string $name = 'Luna'): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => $name, 'weight_unit' => 'kg']);
    }

    /** Every event sent to PostHog so far, as [event, properties]. */
    private function events(): array
    {
        return collect(Http::recorded())
            ->filter(fn ($pair) => str_ends_with($pair[0]->url(), '/batch/'))
            ->flatMap(fn ($pair) => $pair[0]->data()['batch'])
            ->map(fn ($e) => [$e['event'], $e['properties']])
            ->values()
            ->all();
    }

    private function onlyEvent(string $name): array
    {
        $matches = array_values(array_filter($this->events(), fn ($e) => $e[0] === $name));
        $this->assertCount(1, $matches, "expected exactly one {$name}");

        return $matches[0][1];
    }

    public function test_document_extraction_outcome(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $docId = $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('rabies-certificate.jpg', 200, 200),
            'title' => 'Rabies certificate for Luna',
        ])->json('id');

        $mock = $this->mock(DocumentExtractor::class);
        $mock->allows('supports')->andReturnTrue();
        $mock->shouldReceive('extract')->once()->andThrow(new \RuntimeException('provider down'));
        $this->withToken($token)->postJson("/pets/{$pet->id}/documents/{$docId}/extract")->assertStatus(502);

        $props = $this->onlyEvent('server_document_extracted');
        $this->assertSame('failed', $props['status']);
        $this->assertSame('image', $props['mime_family']);
        $this->assertSame((string) config('services.extraction.provider'), $props['provider']);
        $this->assertIsInt($props['duration_ms']);
        $this->assertSame((string) $owner->id, $props['distinct_id']);
        $this->assertStringNotContainsString('Rabies certificate', json_encode($props));
        $this->assertStringNotContainsString('Luna', json_encode($props));
    }

    public function test_records_export(): void
    {
        [$owner, $token] = $this->user();
        $this->pet($owner, 'Luna');
        $this->pet($owner, 'Rex');

        $this->withToken($token)->get('/users/me/export?format=csv')->assertOk();

        $props = $this->onlyEvent('server_records_exported');
        $this->assertSame(['csv', 'all', 2], [$props['format'], $props['scope'], $props['pet_count']]);
    }

    public function test_share_and_care_links(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->postJson("/pets/{$pet->id}/share-link", ['expires_in' => '1h'])->assertOk();
        $this->withToken($token)->postJson("/pets/{$pet->id}/care-link")->assertOk();

        $this->assertSame('1h', $this->onlyEvent('server_share_link_created')['expires_in']);
        $this->assertSame('7d', $this->onlyEvent('server_care_link_created')['expires_in']);
        // The signed URLs (which carry credentials) never reach analytics.
        $this->assertStringNotContainsString('signature', json_encode($this->events()));
    }

    public function test_invite_accepted(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = $this->pet($owner);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $member->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;

        $this->withToken($memberToken)->postJson("/invites/{$inviteId}/accept")->assertOk();

        $this->assertSame((string) $member->id, $this->onlyEvent('server_invite_accepted')['distinct_id']);
    }

    public function test_deletion_requested_then_cancelled_by_logging_back_in(): void
    {
        [$user, $token] = $this->user();

        $this->withToken($token)->deleteJson('/users/me')->assertOk();
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'password1'])
            ->assertOk()->assertJson(['reactivated' => true]);

        $this->onlyEvent('server_account_deletion_requested');
        $this->assertSame('password', $this->onlyEvent('server_account_reactivated')['method']);
    }

    public function test_an_ordinary_login_is_not_a_reactivation(): void
    {
        [$user] = $this->user();

        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'password1'])->assertOk();

        $this->assertSame([], $this->events());
    }

    public function test_opted_out_users_produce_no_events(): void
    {
        [$owner, $token] = $this->user(['analytics_opt_out' => true]);
        $pet = $this->pet($owner);

        $this->withToken($token)->get('/users/me/export?format=csv')->assertOk();
        $this->withToken($token)->postJson("/pets/{$pet->id}/share-link")->assertOk();
        $this->withToken($token)->deleteJson('/users/me')->assertOk();

        $this->assertSame([], $this->events());
        Http::assertNothingSent();
    }
}
