<?php

namespace Tests\Feature;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LostPetTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string, 2: Pet} */
    private function userWithPet(): array
    {
        $user = User::create([
            'name' => 'Owner',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'type' => 'dog']);

        return [$user, JwtService::createAccessToken($user->id), $pet];
    }

    public function test_reporting_creates_active_report_and_broadcast_post(): void
    {
        [$user, $token, $pet] = $this->userWithPet();

        $report = $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Central Park',
            'contact_phone' => '555-1234',
        ])->assertCreated()->json();

        $this->assertSame('active', $report['status']);
        $this->assertSame('Luna', $report['pet_name']);

        // A community post was broadcast by the owner.
        $post = Post::where('author_id', $user->id)->first();
        $this->assertNotNull($post);
        $this->assertStringContainsString('LOST PET', $post->content);
        $this->assertStringContainsString('Central Park', $post->content);
    }

    public function test_reporting_is_owner_only(): void
    {
        [, , $pet] = $this->userWithPet();
        [, $otherToken] = $this->userWithPet();

        $this->withToken($otherToken)->postJson("/pets/{$pet->id}/lost-report", [])->assertNotFound();
    }

    public function test_active_reports_are_visible_community_wide(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $viewerToken] = $this->userWithPet();

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Downtown',
        ])->assertCreated();

        $list = $this->withToken($viewerToken)->getJson('/lost-pets')->assertOk()->json();
        $this->assertCount(1, $list);
        $this->assertSame($pet->id, $list[0]['pet_id']);
    }

    public function test_one_active_report_and_post_per_pet(): void
    {
        [, $token, $pet] = $this->userWithPet();

        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", ['last_seen_location' => 'A'])->assertCreated();
        // Reporting again updates the existing active report (200), no duplicate.
        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", ['last_seen_location' => 'B'])->assertOk();

        $this->assertSame(1, LostPetReport::where('pet_id', $pet->id)->where('status', 'active')->count());
        $this->assertSame(1, Post::count());
    }

    public function test_resolve_marks_found_removes_post_and_is_owner_only(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $otherToken] = $this->userWithPet();

        $id = $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [])->json('id');
        $this->assertSame(1, Post::count());

        // A different user can't resolve it.
        $this->withToken($otherToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertNotFound();

        $resolved = $this->withToken($ownerToken)->patchJson("/lost-pets/{$id}/resolve", [
            'resolution_note' => 'Found safe!',
        ])->assertOk()->json();

        $this->assertSame('resolved', $resolved['status']);
        $this->assertSame('Found safe!', $resolved['resolution_note']);
        $this->assertSame(0, Post::count()); // broadcast post removed
        $this->assertCount(0, $this->withToken($otherToken)->getJson('/lost-pets')->json());
    }

    public function test_mine_lists_own_reports_only(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $otherToken, $otherPet] = $this->userWithPet();

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [])->assertCreated();
        $this->withToken($otherToken)->postJson("/pets/{$otherPet->id}/lost-report", [])->assertCreated();

        $mine = $this->withToken($ownerToken)->getJson('/lost-pets/mine')->json();
        $this->assertCount(1, $mine);
        $this->assertSame($pet->id, $mine[0]['pet_id']);
    }

    public function test_deleting_pet_removes_its_broadcast_post(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", ['last_seen_location' => 'X'])->assertCreated();
        $this->assertSame(1, Post::count());

        $this->withToken($token)->deleteJson("/pets/{$pet->id}")->assertNoContent();

        // No orphaned "LOST PET" post left behind in the feed.
        $this->assertSame(0, Post::count());
        $this->assertSame(0, LostPetReport::count());
    }

    public function test_reporting_again_updates_the_broadcast_post(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", ['last_seen_location' => 'Alpha'])->assertCreated();
        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", ['last_seen_location' => 'Beta'])->assertOk();

        $this->assertSame(1, Post::count());
        $this->assertStringContainsString('Beta', Post::first()->content);
    }

    public function test_resolving_an_already_resolved_report_conflicts(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $id = $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", [])->json('id');

        $this->withToken($token)->patchJson("/lost-pets/{$id}/resolve", [])->assertOk();
        $this->withToken($token)->patchJson("/lost-pets/{$id}/resolve", [])->assertStatus(409);
    }
}
