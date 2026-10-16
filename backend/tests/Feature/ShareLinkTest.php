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
use Illuminate\Support\Facades\URL;
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

        // Verified email: these users accept co-owner invites, which require it.
        $u->forceFill(['email_verified_at' => now()])->save();

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

    public function test_share_trend_spans_full_history_not_just_recent_logs(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);

        // One old light log + 12 recent heavier ones. Over only the eager-loaded
        // recent-12 the trend would read "stable"; over the full history it's a
        // clear gain — so this guards the unbounded-query fix.
        WeightLog::create(['pet_id' => $pet->id, 'weight' => 4.0, 'unit' => 'kg',
            'logged_at' => Carbon::today()->subMonths(8)->format('Y-m-d')]);
        for ($i = 12; $i >= 1; $i--) {
            WeightLog::create(['pet_id' => $pet->id, 'weight' => 4.8, 'unit' => 'kg',
                'logged_at' => Carbon::today()->subDays($i)->format('Y-m-d')]);
        }

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();
        $res->assertSee('Up 0.8 kg (20%)');
        $res->assertSee('months');
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

    // ── Page language (the creator's locale rides in the signed URL) ─────────

    /** @return array{0: User, 1: string} */
    private function userIn(string $locale): array
    {
        [$u, $token] = $this->user();
        $u->forceFill(['locale' => $locale])->save();

        return [$u, $token];
    }

    public function test_a_link_minted_by_a_french_user_opens_in_french(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $this->seedRecords($pet);

        $url = $this->mintUrl($token, $pet);
        $this->assertStringContainsString('lang=fr', $url);

        $res = $this->get($url)->assertOk();
        $this->assertStringStartsWith('<!DOCTYPE html>', $res->getContent());
        $res->assertSee('<html lang="fr">', false);
        $res->assertSee('Luna — Dossier médical');
        $res->assertSee('Chat · Maine Coon'); // type translated, typed breed as entered
        $res->assertSee('Administrée le '.Carbon::today()->subMonth()->locale('fr')->isoFormat('D MMM YYYY'));
        $res->assertSee('Traitements en cours');
        $res->assertSee("En hausse de 0,2 kg (4,3\u{00A0}%) sur les 2 derniers mois");
        $res->assertSee('4,8 kg');
        $res->assertSee('le lien expire le');
        // User-entered record names are never translated.
        $res->assertSee('Rabies');
        $res->assertSee('Simparica');
        $res->assertDontSee('Medical Summary');
        $res->assertDontSee('Active medications');
    }

    public function test_a_link_minted_by_a_spanish_user_opens_in_spanish(): void
    {
        [$owner, $token] = $this->userIn('es');
        $pet = $this->pet($owner);
        $this->seedRecords($pet);

        $res = $this->get($this->mintUrl($token, $pet))->assertOk();

        $res->assertSee('<html lang="es">', false);
        $res->assertSee('Luna — Resumen médico');
        $res->assertSee('Gato · Maine Coon');
        $res->assertSee('Administrada el '.Carbon::today()->subMonth()->locale('es')->isoFormat('D MMM YYYY'));
        $res->assertSee("Sube 0,2 kg (4,3\u{00A0}%) en los últimos 2 meses");
        $res->assertSee('el enlace caduca el');
        $res->assertSee('Rabies');
    }

    public function test_the_expiry_footer_is_localized_and_keeps_the_timezone(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);

        $url = $this->mintUrl($token, $pet, '7d');
        parse_str(parse_url($url, PHP_URL_QUERY), $q);
        $at = Carbon::createFromTimestamp((int) $q['expires']);

        $this->get($url)->assertOk()->assertSee(
            'le lien expire le '.$at->copy()->locale('fr')->isoFormat('D MMM YYYY [à] HH:mm').' '.$at->format('T')
        );
    }

    public function test_english_links_carry_no_lang_param(): void
    {
        [$owner, $token] = $this->user(); // default locale: en
        $pet = $this->pet($owner);

        $url = $this->withToken($token)->withHeader('Accept-Language', 'fr')
            ->postJson("/pets/{$pet->id}/share-link")->json('url');

        // The saved preference (en) wins over the header, and English links
        // look exactly like the ones minted before page languages existed.
        $this->assertStringNotContainsString('lang=', $url);
        $this->get($url)->assertOk()->assertSee('<html lang="en">', false)->assertSee('Luna — Medical Summary');
    }

    public function test_an_old_link_without_lang_still_renders_english(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $this->mintUrl($token, $pet); // gives the pet a share token

        // Shaped like a link minted before this change (no lang), even though
        // the owner now uses French and the viewer's browser asks for Spanish.
        $old = URL::temporarySignedRoute('pets.share', now()->addDay(), ['pet' => $pet->id, 't' => $pet->fresh()->share_token]);

        $res = $this->withHeader('Accept-Language', 'es')->get($old)->assertOk();
        $res->assertSee('<html lang="en">', false);
        $res->assertSee('No vaccinations on record.');
        $res->assertSee('Shared via PawPawCare · read-only · link expires');
    }

    public function test_a_tampered_lang_param_fails_the_signature(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);

        $this->get(str_replace('lang=fr', 'lang=es', $url))->assertStatus(403);
        $this->get(str_replace('lang=fr&', '', $url))->assertStatus(403);

        [$enOwner, $enToken] = $this->user();
        $enPet = $this->pet($enOwner);
        $this->get($this->mintUrl($enToken, $enPet).'&lang=fr')->assertStatus(403);
    }

    public function test_an_unsupported_lang_value_falls_back_to_english(): void
    {
        [$owner, $token] = $this->user();
        $pet = $this->pet($owner);
        $this->mintUrl($token, $pet);

        // Correctly signed, but not one of User::LOCALES.
        $url = URL::temporarySignedRoute('pets.share', now()->addDay(), [
            'pet' => $pet->id, 't' => $pet->fresh()->share_token, 'lang' => 'de',
        ]);

        $this->get($url)->assertOk()->assertSee('<html lang="en">', false)->assertSee('Luna — Medical Summary');
    }

    public function test_revocation_and_expiry_apply_to_localized_links(): void
    {
        [$owner, $token] = $this->userIn('es');
        $pet = $this->pet($owner);

        $url = $this->mintUrl($token, $pet, '1h');
        $this->get($url)->assertOk();
        $this->get($url.'&hl=fr')->assertOk();

        $this->travel(2)->hours();
        $this->get($url)->assertStatus(403);
        $this->get($url.'&hl=en')->assertStatus(403); // hl never bypasses expiry
        $this->travelBack();

        $live = $this->mintUrl($token, $pet, '24h');
        $this->withToken($token)->deleteJson("/pets/{$pet->id}/share-link")->assertNoContent();
        $this->get($live)->assertStatus(410);
        $this->get($live.'&hl=en')->assertStatus(410);
    }

    // ── Viewer language switch (unsigned hl, display only) ───────────────────

    public function test_the_language_switch_changes_only_the_language(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $this->seedRecords($pet);
        $url = $this->mintUrl($token, $pet);

        $fr = $this->get($url)->assertOk();
        // The switch links back to the same signed URL plus hl.
        $this->assertSame(1, preg_match('/href="\?([^"]*hl=es)"/', $fr->getContent(), $m));
        $esUrl = strtok($url, '?').'?'.html_entity_decode($m[1]);

        $es = $this->get($esUrl)->assertOk();
        $es->assertSee('<html lang="es">', false);
        $es->assertSee('Luna — Resumen médico');

        $en = $this->get($url.'&hl=en')->assertOk();
        $en->assertSee('<html lang="en">', false);
        $en->assertSee('Up 0.2 kg (4.3%)');

        // Same records whatever the language.
        foreach ([$fr, $es, $en] as $res) {
            $res->assertSee('Rabies');
            $res->assertSee('Simparica');
            $res->assertDontSee('Old Med');
        }
    }

    public function test_switch_links_replace_hl_instead_of_stacking_it(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);
        $path = parse_url($url, PHP_URL_PATH);

        // Opened already switched, so the links must replace hl, not add a second one.
        $page = $this->get($url.'&hl=en')->assertOk()->getContent();

        $this->assertSame(1, preg_match('/<a href="([^"]+)" lang="es"/', $page, $m));
        $href = html_entity_decode($m[1]);
        $this->assertStringStartsWith('?', $href);
        $this->assertSame(1, substr_count($href, 'hl='));
        $this->assertSame(1, preg_match('/<a href="[^"]+" lang="en" hreflang="en" aria-current="true">English<\/a>/', $page));

        $this->get($path.$href)->assertOk()->assertSee('Luna — Resumen médico');
    }

    public function test_hl_cannot_point_the_link_at_other_data(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);

        $other = Pet::create(['owner_id' => $owner->id, 'name' => 'Rex', 'type' => 'dog']);
        $this->mintUrl($token, $other);

        // Only an exact `hl` key is ignored by the signature check; anything
        // else (other params, look-alike keys) still invalidates the link.
        $this->get($url.'&hl=en&pet='.$other->id)->assertStatus(403);
        $this->get($url.'&hl=en&t='.$other->fresh()->share_token)->assertStatus(403);
        $this->get($url.'&hl[]=en')->assertStatus(403);
        $this->get($url.'&h%6C=en')->assertStatus(403);

        $res = $this->get($url.'&hl=en')->assertOk();
        $res->assertSee('Luna');
        $res->assertDontSee('Rex');
    }

    public function test_an_invalid_hl_falls_back_to_the_signed_language(): void
    {
        [$owner, $token] = $this->userIn('fr');
        $pet = $this->pet($owner);
        $url = $this->mintUrl($token, $pet);

        $this->get($url.'&hl=de')->assertOk()->assertSee('<html lang="fr">', false);
        $this->get($url.'&hl=')->assertOk()->assertSee('<html lang="fr">', false);
        $this->get($url.'&hl=%3Cscript%3E')->assertOk()->assertSee('<html lang="fr">', false)->assertDontSee('<script>', false);
    }
}
