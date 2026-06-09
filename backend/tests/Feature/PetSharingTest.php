<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\Reminder;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PetSharingTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(?string $email = null): array
    {
        $user = User::create([
            'name' => 'User',
            'email' => $email ?? ('u'.uniqid().'@example.com'),
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
    }

    /** Owner invites → invitee accepts → becomes a co-owner with full access. */
    private function share(Pet $pet, string $ownerToken, User $invitee, string $inviteeToken): void
    {
        $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])
            ->assertCreated();

        $inviteId = $this->withToken($inviteeToken)->getJson('/invites')->json('0.id');
        $this->withToken($inviteeToken)->postJson("/invites/{$inviteId}/accept")->assertOk();
    }

    public function test_owner_can_invite_by_email(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee] = $this->user();
        $pet = $this->pet($owner);

        $body = $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])
            ->assertCreated()
            ->json();

        $this->assertSame('pending', $body['status']);
        $this->assertSame($invitee->email, $body['email']);
    }

    public function test_inviting_is_idempotent(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])->assertCreated();
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])->assertOk();

        $this->assertSame(1, PetInvite::where('pet_id', $pet->id)->where('status', 'pending')->count());
    }

    public function test_cannot_invite_yourself_or_an_existing_member(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $owner->email])
            ->assertStatus(422);

        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])
            ->assertStatus(422);
    }

    public function test_non_owner_cannot_invite(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        [$outsider, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        // A co-owner can't re-share, and a stranger can't see the pet at all.
        $this->withToken($inviteeToken)->postJson("/pets/{$pet->id}/invites", ['email' => $outsider->email])->assertNotFound();
        $this->withToken($outsiderToken)->postJson("/pets/{$pet->id}/invites", ['email' => 'x@example.com'])->assertNotFound();
    }

    public function test_member_gains_access_to_pet_and_subresources(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);

        // Before accepting: no access.
        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}")->assertNotFound();
        $this->withToken($inviteeToken)->getJson('/pets')->assertOk()->assertJsonCount(0);

        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        // After accepting: the shared pet shows up and its records are reachable.
        $this->withToken($inviteeToken)->getJson('/pets')->assertOk()->assertJsonCount(1);
        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}")->assertOk();
        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}/weights")->assertOk();
        $this->withToken($inviteeToken)
            ->postJson("/pets/{$pet->id}/weights", ['weight' => 12])
            ->assertCreated();
    }

    public function test_non_member_is_denied(): void
    {
        [$owner] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}")->assertNotFound();
        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/weights")->assertNotFound();
        $this->withToken($outsiderToken)->postJson("/pets/{$pet->id}/weights", ['weight' => 5])->assertNotFound();
    }

    public function test_cannot_accept_someone_elses_invite(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;

        // The invite is addressed to $invitee, not the outsider.
        $this->withToken($outsiderToken)->postJson("/invites/{$inviteId}/accept")->assertNotFound();
        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}")->assertNotFound();
    }

    public function test_only_owner_can_delete_shared_pet(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        // A co-owner can read/write but not delete the pet.
        $this->withToken($inviteeToken)->deleteJson("/pets/{$pet->id}")->assertStatus(403);
        $this->assertNotNull($pet->fresh());

        $this->withToken($ownerToken)->deleteJson("/pets/{$pet->id}")->assertNoContent();
        $this->assertNull($pet->fresh());
    }

    public function test_owner_can_remove_a_member(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        $this->withToken($ownerToken)->deleteJson("/pets/{$pet->id}/members/{$invitee->id}")->assertNoContent();

        // Access is revoked immediately.
        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}")->assertNotFound();
        $this->withToken($inviteeToken)->getJson('/pets')->assertJsonCount(0);
    }

    public function test_member_can_leave(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        $this->withToken($inviteeToken)->postJson("/pets/{$pet->id}/leave")->assertNoContent();
        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}")->assertNotFound();

        // The owner is unaffected.
        $this->withToken($ownerToken)->getJson("/pets/{$pet->id}")->assertOk();
    }

    public function test_decline_leaves_no_membership(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])->assertCreated();
        $inviteId = $this->withToken($inviteeToken)->getJson('/invites')->json('0.id');
        $this->withToken($inviteeToken)->postJson("/invites/{$inviteId}/decline")->assertNoContent();

        $this->withToken($inviteeToken)->getJson("/pets/{$pet->id}")->assertNotFound();
        $this->withToken($inviteeToken)->getJson('/invites')->assertJsonCount(0);
    }

    public function test_owner_can_cancel_a_pending_invite(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);

        $inviteId = $this->withToken($ownerToken)
            ->postJson("/pets/{$pet->id}/invites", ['email' => $invitee->email])
            ->json('id');

        $this->withToken($ownerToken)->deleteJson("/pets/{$pet->id}/invites/{$inviteId}")->assertNoContent();
        $this->withToken($inviteeToken)->getJson('/invites')->assertJsonCount(0);
    }

    private function reminderCount(string $userId, string $petId): int
    {
        return Reminder::where('user_id', $userId)->where('pet_id', $petId)->count();
    }

    public function test_accepting_an_invite_backfills_care_reminders(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);

        // The pet already has a vaccination (a reminder exists for the owner).
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2026-12-01',
        ])->assertCreated();
        $this->assertSame(1, $this->reminderCount($owner->id, $pet->id));
        $this->assertSame(0, $this->reminderCount($invitee->id, $pet->id));

        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        // The new co-owner gets their own copy of the care reminders.
        $this->assertSame(1, $this->reminderCount($invitee->id, $pet->id));
    }

    public function test_new_vaccination_fans_out_to_co_owners(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);

        // Adding a vaccination after sharing reminds the owner and the co-owner.
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Distemper', 'due_date' => '2026-11-01',
        ])->assertCreated();

        $this->assertSame(1, $this->reminderCount($owner->id, $pet->id));
        $this->assertSame(1, $this->reminderCount($invitee->id, $pet->id));
    }

    public function test_leaving_purges_the_members_reminders(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2026-12-01',
        ])->assertCreated();
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);
        $this->assertSame(1, $this->reminderCount($invitee->id, $pet->id));

        $this->withToken($inviteeToken)->postJson("/pets/{$pet->id}/leave")->assertNoContent();

        // The departing co-owner's reminders go; the owner's stay.
        $this->assertSame(0, $this->reminderCount($invitee->id, $pet->id));
        $this->assertSame(1, $this->reminderCount($owner->id, $pet->id));
    }

    public function test_removing_a_member_purges_their_reminders(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$invitee, $inviteeToken] = $this->user();
        $pet = $this->pet($owner);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/vaccinations", [
            'name' => 'Rabies', 'due_date' => '2026-12-01',
        ])->assertCreated();
        $this->share($pet, $ownerToken, $invitee, $inviteeToken);
        $this->assertSame(1, $this->reminderCount($invitee->id, $pet->id));

        $this->withToken($ownerToken)->deleteJson("/pets/{$pet->id}/members/{$invitee->id}")->assertNoContent();

        $this->assertSame(0, $this->reminderCount($invitee->id, $pet->id));
    }

    public function test_members_listing_reports_owner_members_and_invites(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        [$pending] = $this->user();
        $pet = $this->pet($owner);
        $this->share($pet, $ownerToken, $member, $memberToken);
        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $pending->email])->assertCreated();

        $state = $this->withToken($ownerToken)->getJson("/pets/{$pet->id}/members")->assertOk()->json();

        $this->assertSame($owner->id, $state['owner']['id']);
        $this->assertTrue($state['is_owner']);
        $this->assertCount(1, $state['members']);
        $this->assertSame($member->id, $state['members'][0]['id']);
        $this->assertCount(1, $state['invites']);
        $this->assertSame($pending->email, $state['invites'][0]['email']);

        // A co-owner sees the same roster but is not flagged as owner.
        $this->withToken($memberToken)->getJson("/pets/{$pet->id}/members")
            ->assertOk()
            ->assertJsonPath('is_owner', false);
    }
}
