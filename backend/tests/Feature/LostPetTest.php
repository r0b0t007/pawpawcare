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

    /** @return array{0: User, 1: string} a co-owner of $pet */
    private function coOwnerOf(Pet $pet): array
    {
        [$member, $token] = $this->userWithPet();
        $pet->members()->attach($member->id, ['role' => 'member', 'created_at' => now()]);

        return [$member, $token];
    }

    // CHW-277: a pet's lost status belongs to the pet, not to whoever filed it.
    public function test_a_co_owner_sees_the_report_and_can_mark_the_pet_found(): void
    {
        [$owner, $ownerToken, $pet] = $this->userWithPet();
        [, $memberToken] = $this->coOwnerOf($pet);
        $id = $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Central Park',
        ])->assertCreated()->json('id');

        $mine = $this->withToken($memberToken)->getJson('/lost-pets/mine')->assertOk()->json();
        $this->assertCount(1, $mine);
        $this->assertSame($id, $mine[0]['id']);
        $this->assertSame($owner->id, $mine[0]['reported_by']);
        $this->assertTrue($mine[0]['is_mine']);

        $resolved = $this->withToken($memberToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertOk()->json();
        $this->assertSame('resolved', $resolved['status']);
        $this->assertSame(0, Post::count());
    }

    public function test_the_board_says_which_reports_are_on_my_pets(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $memberToken] = $this->coOwnerOf($pet);
        [, $strangerToken] = $this->userWithPet();
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [])->assertCreated();

        $this->assertTrue($this->withToken($ownerToken)->getJson('/lost-pets')->json('0.is_mine'));
        $this->assertTrue($this->withToken($memberToken)->getJson('/lost-pets')->json('0.is_mine'));
        $this->assertFalse($this->withToken($strangerToken)->getJson('/lost-pets')->json('0.is_mine'));
    }

    // A co-owner's report form starts blank: reporting again must not erase
    // the last-seen place or the phone, nor take the report over.
    public function test_reporting_again_keeps_the_details_left_out_and_the_reporter(): void
    {
        [$owner, $ownerToken, $pet] = $this->userWithPet();
        [, $memberToken] = $this->coOwnerOf($pet);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Central Park',
            'contact_phone' => '555-1234',
            'description' => 'Red collar',
        ])->assertCreated();

        $report = $this->withToken($memberToken)->postJson("/pets/{$pet->id}/lost-report", [
            'description' => 'Seen near the lake',
        ])->assertOk()->json();

        $this->assertSame('Central Park', $report['last_seen_location']);
        $this->assertSame('555-1234', $report['contact_phone']);
        $this->assertSame('Seen near the lake', $report['description']);
        $this->assertSame($owner->id, $report['reported_by']);
        $this->assertSame(1, LostPetReport::where('pet_id', $pet->id)->count());
        $this->assertStringContainsString('555-1234', Post::first()->content);
    }

    // A phone shared by mistake must come off the public board without taking
    // the alert down.
    public function test_reporting_again_with_a_null_or_empty_detail_clears_it(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Central Park',
            'contact_phone' => '555-1234',
        ])->assertCreated();

        $report = $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", [
            'contact_phone' => null,
            'description' => '',
        ])->assertOk()->json();

        $this->assertNull($report['contact_phone']);
        $this->assertNull($report['description']);
        $this->assertSame('Central Park', $report['last_seen_location']);
        $this->assertSame('active', $report['status']);
        $this->assertStringNotContainsString('555-1234', Post::first()->content);
    }

    // Whoever filed a report can always take it down — even after leaving the
    // pet, since it may carry their own phone number.
    public function test_someone_who_filed_the_report_and_left_the_pet_can_still_mark_it_found(): void
    {
        [, , $pet] = $this->userWithPet();
        [$member, $memberToken] = $this->coOwnerOf($pet);
        $id = $this->withToken($memberToken)->postJson("/pets/{$pet->id}/lost-report", [
            'contact_phone' => '555-9876',
        ])->assertCreated()->json('id');
        $pet->members()->detach($member->id);

        $mine = $this->withToken($memberToken)->getJson('/lost-pets/mine')->json();
        $this->assertSame([$id], array_column($mine, 'id'));
        $this->assertTrue($mine[0]['is_mine']);
        $this->assertTrue($this->withToken($memberToken)->getJson('/lost-pets')->json('0.is_mine'));
        $this->withToken($memberToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertOk();

        // Once it is down, the pet's history is no longer theirs to see.
        $this->assertCount(0, $this->withToken($memberToken)->getJson('/lost-pets/mine')->json());
    }

    // The family takes back a report left with someone who no longer shares
    // the pet: re-reporting passes it on, and that person's phone goes too.
    public function test_re_reporting_takes_back_a_report_filed_by_someone_who_left(): void
    {
        [$owner, $ownerToken, $pet] = $this->userWithPet();
        [$member, $memberToken] = $this->coOwnerOf($pet);
        $id = $this->withToken($memberToken)->postJson("/pets/{$pet->id}/lost-report", [
            'last_seen_location' => 'Central Park',
            'contact_phone' => '555-9876',
        ])->assertCreated()->json('id');
        $pet->members()->detach($member->id);

        $report = $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [
            'description' => 'Red collar',
        ])->assertOk()->json();

        $this->assertSame($id, $report['id']);
        $this->assertSame($owner->id, $report['reported_by']);
        $this->assertNull($report['contact_phone']);
        $this->assertSame('Central Park', $report['last_seen_location']);
        $this->assertStringNotContainsString('555-9876', Post::first()->content);
        $this->assertSame($owner->id, Post::first()->author_id);
        $this->assertFalse($this->withToken($memberToken)->getJson('/lost-pets')->json('0.is_mine'));
        $this->assertCount(0, $this->withToken($memberToken)->getJson('/lost-pets/mine')->json());
        $this->withToken($memberToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertNotFound();
    }

    // is_mine on the board and the mine list are two writings of one rule: for
    // every viewer, the board's mine-flagged reports are exactly mine's active ones.
    public function test_the_board_flag_and_the_mine_list_agree_for_every_viewer(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [, $memberToken] = $this->coOwnerOf($pet);
        [, $leaverToken] = $this->coOwnerOf($pet);
        [, $strangerToken, $strangerPet] = $this->userWithPet();
        $this->withToken($leaverToken)->postJson("/pets/{$pet->id}/lost-report", [])->assertCreated();
        $this->withToken($strangerToken)->postJson("/pets/{$strangerPet->id}/lost-report", [])->assertCreated();
        $leaverId = LostPetReport::where('pet_id', $pet->id)->value('reported_by');
        $pet->members()->detach($leaverId);

        foreach ([$ownerToken, $memberToken, $leaverToken, $strangerToken] as $token) {
            $flagged = collect($this->withToken($token)->getJson('/lost-pets')->json())
                ->where('is_mine', true)->pluck('id')->sort()->values()->all();
            $mine = collect($this->withToken($token)->getJson('/lost-pets/mine')->json())
                ->where('status', 'active')->pluck('id')->sort()->values()->all();
            $this->assertSame($mine, $flagged);
        }
    }

    // After marking found, the answer says whether it is still mine — as the
    // lists would.
    public function test_resolving_answers_with_the_same_is_mine_as_the_lists(): void
    {
        [, , $pet] = $this->userWithPet();
        [$member, $memberToken] = $this->coOwnerOf($pet);
        $id = $this->withToken($memberToken)->postJson("/pets/{$pet->id}/lost-report", [])->json('id');
        $pet->members()->detach($member->id);

        $resolved = $this->withToken($memberToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertOk()->json();

        $this->assertFalse($resolved['is_mine']);
    }

    public function test_someone_who_left_the_pet_can_no_longer_mark_it_found(): void
    {
        [, $ownerToken, $pet] = $this->userWithPet();
        [$member, $memberToken] = $this->coOwnerOf($pet);
        $id = $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/lost-report", [])->json('id');
        $pet->members()->detach($member->id);

        $this->assertCount(0, $this->withToken($memberToken)->getJson('/lost-pets/mine')->json());
        $this->withToken($memberToken)->patchJson("/lost-pets/{$id}/resolve", [])->assertNotFound();
    }

    public function test_resolving_an_already_resolved_report_conflicts(): void
    {
        [, $token, $pet] = $this->userWithPet();
        $id = $this->withToken($token)->postJson("/pets/{$pet->id}/lost-report", [])->json('id');

        $this->withToken($token)->patchJson("/lost-pets/{$id}/resolve", [])->assertOk();
        $this->withToken($token)->patchJson("/lost-pets/{$id}/resolve", [])->assertStatus(409);
    }
}
