<?php

namespace Tests\Feature;

use App\Models\Milestone;
use App\Models\Pet;
use App\Models\User;
use App\Models\WeightLog;
use App\Services\JwtService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class GamificationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function actingUser(array $attrs = []): array
    {
        $user = User::create(array_merge([
            'name' => 'Test',
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ], $attrs));

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function makePet(User $owner, array $attrs = []): Pet
    {
        return Pet::create(array_merge(['owner_id' => $owner->id, 'name' => 'Luna'], $attrs));
    }

    /** Log one weight entry n weeks ago — the simplest care signal. */
    private function logWeightWeeksAgo(Pet $pet, int $weeksAgo): void
    {
        WeightLog::create([
            'pet_id' => $pet->id,
            'weight' => 12.5,
            'unit' => 'kg',
            'logged_at' => CarbonImmutable::now()->subWeeks($weeksAgo)->toDateString(),
        ]);
    }

    // ── Auth & access control ────────────────────────────────────────────────

    public function test_summary_requires_auth(): void
    {
        $this->getJson('/gamification/summary')->assertStatus(401);
    }

    public function test_summary_scopes_to_accessible_pets_only(): void
    {
        [$owner, $ownerToken] = $this->actingUser();
        [, $strangerToken] = $this->actingUser();

        $pet = $this->makePet($owner);
        $this->logWeightWeeksAgo($pet, 0);
        $this->artisan('gamification:nightly')->assertSuccessful();

        // Owner sees the pet's streak + milestones.
        $ownerRes = $this->withToken($ownerToken)->getJson('/gamification/summary')->assertOk()->json();
        $this->assertCount(1, $ownerRes['streaks']);
        $this->assertSame($pet->id, $ownerRes['streaks'][0]['pet_id']);
        $this->assertNotEmpty($ownerRes['milestones']);

        // A stranger sees nothing (IDOR guard via accessibleBy).
        $strangerRes = $this->withToken($strangerToken)->getJson('/gamification/summary')->assertOk()->json();
        $this->assertSame([], $strangerRes['streaks']);
        $this->assertSame([], $strangerRes['milestones']);
    }

    public function test_family_member_sees_shared_pet_streak(): void
    {
        [$owner] = $this->actingUser();
        [$member, $memberToken] = $this->actingUser();

        $pet = $this->makePet($owner);
        DB::table('pet_members')->insert([
            'pet_id' => $pet->id, 'user_id' => $member->id, 'role' => 'member', 'created_at' => now(),
        ]);
        $this->logWeightWeeksAgo($pet, 0);
        $this->artisan('gamification:nightly')->assertSuccessful();

        $res = $this->withToken($memberToken)->getJson('/gamification/summary')->assertOk()->json();
        $this->assertCount(1, $res['streaks']);
        $this->assertSame($pet->id, $res['streaks'][0]['pet_id']);
    }

    // ── Streak math ──────────────────────────────────────────────────────────

    public function test_consecutive_weeks_build_a_streak(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        foreach ([0, 1, 2, 3] as $weeksAgo) {
            $this->logWeightWeeksAgo($pet, $weeksAgo);
        }

        $this->artisan('gamification:nightly')->assertSuccessful();

        $streak = $this->withToken($token)->getJson('/gamification/summary')->json('streaks.0');
        $this->assertSame(4, $streak['current_weeks']);
        $this->assertSame(4, $streak['longest_weeks']);
    }

    public function test_quiet_current_week_does_not_break_the_streak(): void
    {
        // Care logged last week and the week before, nothing yet this week —
        // the running week isn't over, so the streak must read as alive.
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        $this->logWeightWeeksAgo($pet, 1);
        $this->logWeightWeeksAgo($pet, 2);

        $this->artisan('gamification:nightly')->assertSuccessful();

        $streak = $this->withToken($token)->getJson('/gamification/summary')->json('streaks.0');
        $this->assertSame(2, $streak['current_weeks']);
    }

    public function test_gap_resets_current_but_keeps_longest(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        // A 3-week run that ended 5 weeks ago (weeks 5,6,7 ago), then silence.
        foreach ([5, 6, 7] as $weeksAgo) {
            $this->logWeightWeeksAgo($pet, $weeksAgo);
        }

        $this->artisan('gamification:nightly')->assertSuccessful();

        $streak = $this->withToken($token)->getJson('/gamification/summary')->json('streaks.0');
        $this->assertSame(0, $streak['current_weeks']);
        $this->assertSame(3, $streak['longest_weeks']);
    }

    public function test_recompute_is_idempotent_and_self_healing(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        $this->logWeightWeeksAgo($pet, 0);

        $this->artisan('gamification:nightly')->assertSuccessful();
        $this->artisan('gamification:nightly')->assertSuccessful();

        $res = $this->withToken($token)->getJson('/gamification/summary')->json();
        // One streak row (unique pet_id), one first_record + weights would need 5.
        $this->assertCount(1, $res['streaks']);
        $this->assertSame(1, $res['streaks'][0]['current_weeks']);
        $this->assertCount(1, array_filter($res['milestones'], fn ($m) => $m['key'] === 'first_record'));
        // created_at is populated even though the model manages it manually
        // ($timestamps = false; earned_at can be backdated, created_at can't).
        $this->assertNotNull(Milestone::where('pet_id', $pet->id)->first()->created_at);
    }

    public function test_future_dated_care_cannot_forge_or_zero_a_streak(): void
    {
        // Security review: a future-dated record must neither inflate
        // longest_weeks nor displace the "latest week" (which would zero the
        // family's current streak until that date arrives).
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        $this->logWeightWeeksAgo($pet, 0);
        $this->logWeightWeeksAgo($pet, 1);
        // Directly insert future logs (the API validates them away, but the
        // command must be robust regardless of how the row got there).
        foreach ([4, 8, 12] as $weeksAhead) {
            WeightLog::create([
                'pet_id' => $pet->id, 'weight' => 12, 'unit' => 'kg',
                'logged_at' => CarbonImmutable::now()->addWeeks($weeksAhead)->toDateString(),
            ]);
        }

        $this->artisan('gamification:nightly')->assertSuccessful();

        $streak = $this->withToken($token)->getJson('/gamification/summary')->json('streaks.0');
        $this->assertSame(2, $streak['current_weeks']);
        $this->assertSame(2, $streak['longest_weeks']);
    }

    public function test_dose_log_rejects_future_administered_at(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        $medId = $this->withToken($token)->postJson("/pets/{$pet->id}/medications", [
            'name' => 'Apoquel', 'frequency' => 'daily',
        ])->assertCreated()->json('id');

        $this->withToken($token)->postJson("/pets/{$pet->id}/medications/{$medId}/log", [
            'administered_at' => CarbonImmutable::now()->addWeek()->toISOString(),
        ])->assertStatus(422);
    }

    // ── Milestones ───────────────────────────────────────────────────────────

    public function test_record_and_weight_milestones_award_at_thresholds(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        // 10 weight logs on distinct past days (also 10 total records).
        for ($i = 0; $i < 10; $i++) {
            WeightLog::create([
                'pet_id' => $pet->id, 'weight' => 10 + $i, 'unit' => 'kg',
                'logged_at' => CarbonImmutable::now()->subDays($i)->toDateString(),
            ]);
        }

        $this->artisan('gamification:nightly')->assertSuccessful();

        $keys = collect($this->withToken($token)->getJson('/gamification/summary')->json('milestones'))->pluck('key');
        $this->assertTrue($keys->contains('first_record'));
        $this->assertTrue($keys->contains('records_10'));
        $this->assertTrue($keys->contains('weights_5'));
        $this->assertFalse($keys->contains('records_25'));
        $this->assertFalse($keys->contains('weights_20'));
    }

    public function test_milestones_are_never_revoked(): void
    {
        [$owner, $token] = $this->actingUser();
        $pet = $this->makePet($owner);
        $this->logWeightWeeksAgo($pet, 0);
        $this->artisan('gamification:nightly')->assertSuccessful();

        // Deleting the underlying record must not claw back the badge.
        WeightLog::where('pet_id', $pet->id)->delete();
        $this->artisan('gamification:nightly')->assertSuccessful();

        $keys = collect($this->withToken($token)->getJson('/gamification/summary')->json('milestones'))->pluck('key');
        $this->assertTrue($keys->contains('first_record'));
    }

    public function test_anniversary_only_from_adopted_on(): void
    {
        [$owner, $token] = $this->actingUser();
        // Pet A: gotcha day 2 years ago -> anniversary_1 + anniversary_2, dated
        // on the anniversaries themselves. Pet B: no adopted_on -> none (never
        // faked from created_at).
        $a = $this->makePet($owner, ['adopted_on' => CarbonImmutable::now()->subYears(2)->subDay()->toDateString()]);
        $b = $this->makePet($owner, ['name' => 'Rio']);
        $this->logWeightWeeksAgo($a, 0);
        $this->logWeightWeeksAgo($b, 0);

        $this->artisan('gamification:nightly')->assertSuccessful();

        $milestones = collect($this->withToken($token)->getJson('/gamification/summary')->json('milestones'));
        $aKeys = $milestones->where('pet_id', $a->id)->pluck('key');
        $this->assertTrue($aKeys->contains('anniversary_1'));
        $this->assertTrue($aKeys->contains('anniversary_2'));
        $this->assertFalse($milestones->where('pet_id', $b->id)->pluck('key')->contains('anniversary_1'));
    }

    // ── adopted_on field ─────────────────────────────────────────────────────

    public function test_adopted_on_create_update_and_validation(): void
    {
        [, $token] = $this->actingUser();

        $petId = $this->withToken($token)->postJson('/pets', [
            'name' => 'Nala', 'adopted_on' => '2024-05-01',
        ])->assertCreated()->json('id');

        $this->withToken($token)->getJson("/pets/{$petId}")
            ->assertOk()->assertJsonPath('adopted_on', '2024-05-01');

        // House convention: update ignores nulls (same as birthday) — a null
        // patch is a no-op, corrections are made by sending a new date.
        $this->withToken($token)->patchJson("/pets/{$petId}", ['adopted_on' => null])
            ->assertOk()->assertJsonPath('adopted_on', '2024-05-01');

        $this->withToken($token)->patchJson("/pets/{$petId}", ['adopted_on' => '2024-06-02'])
            ->assertOk()->assertJsonPath('adopted_on', '2024-06-02');

        // A future gotcha day is invalid.
        $this->withToken($token)->patchJson("/pets/{$petId}", [
            'adopted_on' => CarbonImmutable::now()->addYear()->toDateString(),
        ])->assertStatus(422);
    }
}
