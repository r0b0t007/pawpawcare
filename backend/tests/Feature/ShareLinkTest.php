<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ShareLinkTest extends TestCase
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
        return Pet::create([
            'owner_id' => $owner->id, 'name' => 'Luna', 'type' => 'cat',
            'breed' => 'Maine Coon', 'weight' => 4.8, 'weight_unit' => 'kg',
        ]);
    }

    private function seedRecords(Pet $pet): void
    {
        Vaccination::create([
            'pet_id' => $pet->id, 'name' => 'Rabies', 'status' => 'completed',
            'due_date' => Carbon::today()->addYear()->format('Y-m-d'),
            'administered_date' => Carbon::today()->subMonth()->format('Y-m-d'),
        ]);
        Medication::create(['pet_id' => $pet->id, 'name' => 'Simparica', 'dosage' => '40mg', 'times' => []]);
        Medication::create(['pet_id' => $pet->id, 'name' => 'Old Med', 'active' => false, 'times' => []]);
        WeightLog::create(['pet_id' => $pet->id, 'weight' => 4.6, 'unit' => 'kg', 'logged_at' => Carbon::today()->subMonths(2)->format('Y-m-d')]);
        WeightLog::create(['pet_id' => $pet->id, 'weight' => 4.8, 'unit' => 'kg', 'logged_at' => Carbon::today()->format('Y-m-d')]);
    }

    // ── Minting ──────────────────────────────────────────────────────────────

    public function test_owner_can_mint_a_share_link(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $res = $this->withToken($token)->postJson("/pets/{$pet->id}/share-link", ['expires_in' => '24h'])
            ->assertOk()->json();

        $this->assertStringContainsString('signature=', $res['url']);
        $this->assertStringContainsString("/share/{$pet->id}", $res['url']);
        $this->assertEqualsWithDelta(now()->addDay()->timestamp, Carbon::parse($res['expires_at'])->timestamp, 5);
    }

    public function test_a_co_owner_can_mint(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$member, $memberToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($ownerToken)->postJson("/pets/{$pet->id}/invites", ['email' => $member->email])->assertCreated();
        $inviteId = PetInvite::where('pet_id', $pet->id)->first()->id;
        $this->withToken($memberToken)->postJson("/invites/{$inviteId}/accept")->assertOk();

        $this->withToken($memberToken)->postJson("/pets/{$pet->id}/share-link")->assertOk();
    }

    public function test_an_outsider_cannot_mint(): void
    {
        [$owner] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($outsiderToken)->postJson("/pets/{$pet->id}/share-link")->assertNotFound();
    }

    public function test_rejects_an_unknown_expiry(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->postJson("/pets/{$pet->id}/share-link", ['expires_in' => '30d'])
            ->assertStatus(422);
    }

    public function test_each_expiry_choice_maps_to_a_distinct_window(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $at = fn (string $exp) => Carbon::parse(
            $this->withToken($token)->postJson("/pets/{$pet->id}/share-link", ['expires_in' => $exp])->json('expires_at')
        )->timestamp;

        $this->assertEqualsWithDelta(now()->addHour()->timestamp, $at('1h'), 5);
        $this->assertEqualsWithDelta(now()->addDay()->timestamp, $at('24h'), 5);
        $this->assertEqualsWithDelta(now()->addDays(7)->timestamp, $at('7d'), 5);
    }

    // ── Revocation ───────────────────────────────────────────────────────────

    public function test_revoking_invalidates_outstanding_links(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $url = $this->mintUrl($token, $pet, '7d');
        $this->get($url)->assertOk(); // works before revoke

        $this->withToken($token)->deleteJson("/pets/{$pet->id}/share-link")->assertNoContent();

        // Signature is still valid, but the token no longer matches → 410 Gone.
        $this->get($url)->assertStatus(410);
    }

    public function test_a_new_link_works_after_revoking(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $old = $this->mintUrl($token, $pet);
        $this->withToken($token)->deleteJson("/pets/{$pet->id}/share-link")->assertNoContent();
        $new = $this->mintUrl($token, $pet);

        $this->assertNotSame($old, $new);
        $this->get($old)->assertStatus(410);
        $this->get($new)->assertOk();
    }

    public function test_an_outsider_cannot_revoke(): void
    {
        [$owner, $ownerToken] = $this->user();
        [, $outsiderToken] = $this->user();
        $pet = $this->pet($owner);
        $url = $this->mintUrl($ownerToken, $pet);

        $this->withToken($outsiderToken)->deleteJson("/pets/{$pet->id}/share-link")->assertNotFound();

        // The outsider's failed call left the link untouched.
        $this->get($url)->assertOk();
    }

    public function test_share_token_is_not_mass_assignable(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);

        // A pet update must not be able to rotate the token (which would revoke
        // links) — share_token is guarded, not fillable.
        $this->withToken($token)->patchJson("/pets/{$pet->id}", ['share_token' => 'hacked'])->assertOk();

        $this->assertNotSame('hacked', $pet->fresh()->share_token);
        $this->get($url)->assertOk();
    }

    // ── The share page ───────────────────────────────────────────────────────

    private function mintUrl(string $token, Pet $pet, string $expiry = '24h'): string
    {
        return $this->withToken($token)->postJson("/pets/{$pet->id}/share-link", ['expires_in' => $expiry])->json('url');
    }

    public function test_share_page_renders_the_medical_summary(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $this->seedRecords($pet);

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertSee('Luna');
        $res->assertSee('Maine Coon');
        $res->assertSee('Rabies');
        $res->assertSee('Simparica');
        $res->assertSee('40mg');
        $res->assertSee('4.8');
        // Weight trend insight (4.6 → 4.8 = +0.2 kg, 4.3%).
        $res->assertSee('Up 0.2 kg (4.3%)');
        // Inactive medications are not shared.
        $res->assertDontSee('Old Med');
        // Crawlers are told to stay away.
        $res->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    public function test_share_page_does_not_leak_owner_identity(): void
    {
        [$owner, $token] = $this->user('private.owner@example.com');
        $pet = $this->pet($owner);

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertDontSee('private.owner@example.com');
        $res->assertDontSee($owner->id);
    }

    public function test_share_page_renders_with_no_records(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner); // no vaccinations, meds, weights, etc.

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertSee('Luna');
        $res->assertSee('No vaccinations on record.');
        $res->assertSee('No active medications.');
        $res->assertSee('No weight history.');
    }

    public function test_tampered_and_expired_links_are_rejected(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $url = $this->mintUrl($token, $pet, '1h');

        $this->get($url.'tampered')->assertStatus(403);

        $this->travel(2)->hours();
        $this->get($url)->assertStatus(403);
    }

    public function test_share_page_document_links_work_and_expire_with_the_page(): void
    {
        Storage::fake('local');
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        $this->withToken($token)->post("/pets/{$pet->id}/documents", [
            'file' => UploadedFile::fake()->image('lab.jpg'), 'title' => 'Bloodwork panel',
        ])->assertCreated();

        $page = $this->get($this->mintUrl($token, $pet, '1h'))->assertOk();
        $page->assertSee('Bloodwork panel');

        // The embedded document link is a working signed URL...
        preg_match('/href="([^"]*\/documents\/[^"]*)"/', $page->getContent(), $m);
        $docUrl = html_entity_decode($m[1]);
        $this->get($docUrl)->assertOk();

        // ...that dies with the share link, not on the usual 5-minute clock.
        $this->travel(30)->minutes();
        $this->get($docUrl)->assertOk();
        $this->travel(31)->minutes(); // past the 1h share expiry
        $this->get($docUrl)->assertStatus(403);
    }
}
