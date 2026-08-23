<?php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\EngagementPush;
use App\Models\Pet;
use App\Models\User;
use App\Models\WeightLog;
use App\Services\JwtService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EngagementPushTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['exp.host/*' => Http::response(['data' => []])]);
    }

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

    private function withDevice(User $user): void
    {
        DeviceToken::create([
            'user_id' => $user->id,
            'token' => 'ExponentPushToken['.uniqid().']',
            'platform' => 'ios',
            'timezone' => 'UTC',
        ]);
    }

    /** A UTC instant whose UTC-local hour is 09:00 (celebration hour). */
    private function celebrationInstant(string $date = '2026-08-24'): string
    {
        return "{$date} 09:30:00";
    }

    // ── Birthday / gotcha-day ────────────────────────────────────────────────

    public function test_birthday_push_sent_at_local_morning_and_deduped(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        $pet = Pet::create([
            'owner_id' => $user->id, 'name' => 'Luna', 'birthday' => '2024-08-24',
        ]);

        $this->travelTo($this->celebrationInstant('2026-08-24'));

        $this->artisan('engagement:send')->assertSuccessful();
        $this->artisan('engagement:send')->assertSuccessful(); // rerun = no-op

        $rows = EngagementPush::where('user_id', $user->id)->where('kind', 'birthday')->get();
        $this->assertCount(1, $rows);
        $this->assertSame($pet->id, $rows[0]->pet_id);
        $this->assertNotNull($rows[0]->sent_at);
        Http::assertSentCount(1);
    }

    public function test_co_owner_also_gets_the_celebration_for_a_shared_pet(): void
    {
        // The fan-out is intentional: the streak/celebration is the PET's, and
        // every caretaker shares it. Tokens must still resolve per-recipient.
        [$owner] = $this->actingUser();
        [$member] = $this->actingUser();
        $this->withDevice($owner);
        $this->withDevice($member);
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna', 'birthday' => '2024-08-24']);
        DB::table('pet_members')->insert([
            'pet_id' => $pet->id, 'user_id' => $member->id, 'role' => 'member', 'created_at' => now(),
        ]);

        $this->travelTo($this->celebrationInstant('2026-08-24'));
        $this->artisan('engagement:send')->assertSuccessful();

        // One ledger row per recipient — both the owner and the co-owner.
        $this->assertSame(2, EngagementPush::where('kind', 'birthday')->where('pet_id', $pet->id)->count());
        $this->assertSame(1, EngagementPush::where('user_id', $member->id)->count());
    }

    public function test_gotcha_day_push_uses_adopted_on(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        Pet::create([
            'owner_id' => $user->id, 'name' => 'Rio', 'adopted_on' => '2023-08-24',
        ]);

        $this->travelTo($this->celebrationInstant('2026-08-24'));
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(1, EngagementPush::where('kind', 'gotcha_day')->count());
    }

    public function test_no_push_outside_the_celebration_hour(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'birthday' => '2024-08-24']);

        $this->travelTo('2026-08-24 14:30:00');
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(0, EngagementPush::count());
        Http::assertNothingSent();
    }

    public function test_no_push_on_a_non_anniversary_day_or_origin_year(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        Pet::create(['owner_id' => $user->id, 'name' => 'Luna', 'birthday' => '2024-08-20']);
        // Origin-year edge: adopted TODAY must not fire "0 years together".
        Pet::create(['owner_id' => $user->id, 'name' => 'Rio', 'adopted_on' => '2026-08-24']);

        $this->travelTo($this->celebrationInstant('2026-08-24'));
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(0, EngagementPush::count());
    }

    public function test_feb_29_birthday_celebrated_on_mar_1_in_non_leap_years(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        Pet::create(['owner_id' => $user->id, 'name' => 'Leap', 'birthday' => '2024-02-29']);

        $this->travelTo($this->celebrationInstant('2026-03-01')); // 2026 is not a leap year
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(1, EngagementPush::where('kind', 'birthday')->count());
    }

    // ── Opt-out & targeting ──────────────────────────────────────────────────

    public function test_opt_out_and_no_device_are_both_respected(): void
    {
        // Opted out, with device. The flag is deliberately not fillable
        // (explicit assignment in UserController only), so set it directly.
        [$optedOut] = $this->actingUser();
        $optedOut->forceFill(['engagement_pushes_enabled' => false])->save();
        $this->withDevice($optedOut);
        Pet::create(['owner_id' => $optedOut->id, 'name' => 'A', 'birthday' => '2024-08-24']);
        // Opted in, no device.
        [$noDevice] = $this->actingUser();
        Pet::create(['owner_id' => $noDevice->id, 'name' => 'B', 'birthday' => '2024-08-24']);

        $this->travelTo($this->celebrationInstant('2026-08-24'));
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(0, EngagementPush::count());
        Http::assertNothingSent();
    }

    public function test_opt_out_toggles_via_users_me(): void
    {
        [, $token] = $this->actingUser();

        $this->withToken($token)->getJson('/users/me')
            ->assertOk()->assertJsonPath('engagement_pushes_enabled', true);

        $this->withToken($token)->patchJson('/users/me', ['engagement_pushes_enabled' => false])
            ->assertOk()->assertJsonPath('engagement_pushes_enabled', false);
    }

    // ── Weekly recap ─────────────────────────────────────────────────────────

    /** 2026-08-23 is a Sunday; 18:30 UTC = recap hour for a UTC user. */
    private function recapInstant(): string
    {
        return '2026-08-23 18:30:00';
    }

    public function test_sunday_recap_sent_when_care_was_logged(): void
    {
        [$user] = $this->actingUser();
        $this->withDevice($user);
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Luna']);
        WeightLog::create([
            'pet_id' => $pet->id, 'weight' => 12, 'unit' => 'kg',
            'logged_at' => '2026-08-21',
        ]);

        $this->travelTo($this->recapInstant());
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(1, EngagementPush::where('kind', 'weekly_recap')->count());
    }

    public function test_empty_recap_is_suppressed(): void
    {
        // No care actions, no overdue vaccinations -> silence, never
        // a "you did nothing this week" push.
        [$user] = $this->actingUser();
        $this->withDevice($user);
        Pet::create(['owner_id' => $user->id, 'name' => 'Luna']);

        $this->travelTo($this->recapInstant());
        $this->artisan('engagement:send')->assertSuccessful();

        $this->assertSame(0, EngagementPush::where('kind', 'weekly_recap')->count());
        Http::assertNothingSent();
    }

    // ── Recap endpoint ───────────────────────────────────────────────────────

    public function test_recap_endpoint_requires_auth_and_scopes_pets(): void
    {
        $this->getJson('/gamification/recap')->assertStatus(401);

        [$owner, $ownerToken] = $this->actingUser();
        [, $strangerToken] = $this->actingUser();
        $pet = Pet::create(['owner_id' => $owner->id, 'name' => 'Luna']);
        WeightLog::create([
            'pet_id' => $pet->id, 'weight' => 12, 'unit' => 'kg',
            'logged_at' => CarbonImmutable::now()->subDays(2)->toDateString(),
        ]);

        $res = $this->withToken($ownerToken)->getJson('/gamification/recap')->assertOk()->json();
        $this->assertCount(1, $res['per_pet']);
        $this->assertSame($pet->id, $res['per_pet'][0]['pet_id']);
        $this->assertSame(1, $res['per_pet'][0]['weights']);
        $this->assertTrue($res['per_pet'][0]['vax_current']);

        $this->assertSame([], $this->withToken($strangerToken)->getJson('/gamification/recap')->json('per_pet'));
    }
}
