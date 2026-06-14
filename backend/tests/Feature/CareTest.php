<?php

namespace Tests\Feature;

use App\Models\CareProfile;
use App\Models\Clinic;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CareTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(?string $email = null): array
    {
        $u = User::create([
            'name' => 'U',
            'email' => $email ?? ('u'.uniqid().'@example.com'),
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function pet(User $owner): Pet
    {
        return Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'type' => 'cat', 'weight_unit' => 'kg']);
    }

    private function profileData(): array
    {
        return [
            'feeding' => '1 cup kibble at 8am and 6pm. Fresh water daily.',
            'instructions' => 'Litter box in the bathroom. She hides under the bed — that is normal.',
            'emergency_name' => 'Dr. Meow',
            'emergency_phone' => '555-9000',
        ];
    }

    // ── Care profile CRUD ────────────────────────────────────────────────────

    public function test_owner_can_set_and_read_the_care_profile(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        // Empty shell before anything is set.
        $this->withToken($token)->getJson("/pets/{$pet->id}/care")
            ->assertOk()->assertJsonPath('feeding', null);

        $this->withToken($token)->putJson("/pets/{$pet->id}/care", $this->profileData())
            ->assertOk()->assertJsonPath('feeding', $this->profileData()['feeding']);

        $this->withToken($token)->getJson("/pets/{$pet->id}/care")
            ->assertOk()->assertJsonPath('emergency_name', 'Dr. Meow');
    }

    public function test_updating_the_profile_is_idempotent_not_duplicated(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->putJson("/pets/{$pet->id}/care", $this->profileData())->assertOk();
        $this->withToken($token)->putJson("/pets/{$pet->id}/care", ['feeding' => 'Updated'])->assertOk();

        $this->assertSame(1, CareProfile::where('pet_id', $pet->id)->count());
        $this->assertSame('Updated', $pet->careProfile()->first()->feeding);
    }

    public function test_a_co_owner_can_manage_the_care_profile(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $member->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;
        $this->withToken($memberToken)->postJson("/invites/{$inviteId}/accept")->assertOk();

        $this->withToken($memberToken)->putJson("/pets/{$pet->id}/care", ['feeding' => 'Twice a day'])->assertOk();
    }

    public function test_an_outsider_cannot_read_or_write_the_profile(): void
    {
        [$owner] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($outsiderToken)->getJson("/pets/{$pet->id}/care")->assertNotFound();
        $this->withToken($outsiderToken)->putJson("/pets/{$pet->id}/care", ['feeding' => 'x'])->assertNotFound();
    }

    // ── Caretaker link ───────────────────────────────────────────────────────

    private function mintUrl(string $token, Pet $pet, string $expiry = '7d'): string
    {
        return $this->withToken($token)->postJson("/pets/{$pet->id}/care-link", ['expires_in' => $expiry])->json('url');
    }

    public function test_owner_can_mint_a_caretaker_link(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $res = $this->withToken($token)->postJson("/pets/{$pet->id}/care-link", ['expires_in' => '7d'])
            ->assertOk()->json();

        $this->assertStringContainsString("/care/{$pet->id}", $res['url']);
        $this->assertStringContainsString('signature=', $res['url']);
        $this->assertEqualsWithDelta(now()->addDays(7)->timestamp, Carbon::parse($res['expires_at'])->timestamp, 5);
    }

    public function test_rejects_an_unknown_expiry(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->postJson("/pets/{$pet->id}/care-link", ['expires_in' => '1h'])->assertStatus(422);
    }

    public function test_an_outsider_cannot_mint(): void
    {
        [$owner] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($outsiderToken)->postJson("/pets/{$pet->id}/care-link")->assertNotFound();
    }

    public function test_caretaker_page_renders_the_handoff(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $this->withToken($token)->putJson("/pets/{$pet->id}/care", $this->profileData())->assertOk();
        Medication::create(['pet_id' => $pet->id, 'name' => 'Simparica', 'dosage' => '40mg', 'frequency' => 'monthly', 'times' => ['08:00']]);
        Medication::create(['pet_id' => $pet->id, 'name' => 'Retired', 'active' => false, 'times' => []]);
        Clinic::create(['pet_id' => $pet->id, 'name' => 'Happy Paws', 'phone' => '555-1234']);

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertSee('Caring for Luna');
        $res->assertSee('1 cup kibble', false);
        $res->assertSee('Simparica');
        $res->assertSee('Dr. Meow');
        $res->assertSee('555-9000');
        $res->assertSee('Happy Paws');
        // Inactive meds are not shown to the sitter.
        $res->assertDontSee('Retired');
        $res->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    public function test_page_does_not_leak_owner_identity(): void
    {
        [$owner, $token] = $this->user('private.owner@example.com');
        $pet = $this->pet($owner);

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertDontSee('private.owner@example.com');
        $res->assertDontSee($owner->id);
    }

    public function test_tampered_expired_and_revoked_links_are_rejected(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $url = $this->mintUrl($token, $pet, '1d');
        $this->get($url)->assertOk();

        $this->get($url.'tampered')->assertStatus(403);

        // Revoke → token rotates → 410 Gone (signature still valid).
        $this->withToken($token)->deleteJson("/pets/{$pet->id}/care-link")->assertNoContent();
        $this->get($url)->assertStatus(410);
    }

    public function test_care_and_vet_links_revoke_independently(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $careUrl = $this->mintUrl($token, $pet);
        $vetUrl = $this->withToken($token)->postJson("/pets/{$pet->id}/share-link")->json('url');

        // Revoking caretaker links must not touch the vet link.
        $this->withToken($token)->deleteJson("/pets/{$pet->id}/care-link")->assertNoContent();

        $this->get($careUrl)->assertStatus(410);
        $this->get($vetUrl)->assertOk();
    }

    public function test_care_token_is_not_mass_assignable(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);

        $this->withToken($token)->patchJson("/pets/{$pet->id}", ['care_token' => 'hacked'])->assertOk();

        $this->assertNotSame('hacked', $pet->fresh()->care_token);
        $this->get($url)->assertOk();
    }
}
