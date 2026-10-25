<?php

namespace Tests\Feature;

use App\Console\Commands\PurgeDeletedAccounts;
use App\Mail\PasswordResetCodeMail;
use App\Models\DeviceToken;
use App\Models\Document;
use App\Models\Pet;
use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AccountDeletionTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $email = 'delete@example.com'): User
    {
        return User::create([
            'name' => 'Delete Me',
            'email' => $email,
            'hashed_password' => Hash::make('password1'),
            'timezone' => 'UTC',
        ]);
    }

    private function login(User $user): array
    {
        return $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password1',
        ])->assertOk()->json();
    }

    private function authed(array $tokens): array
    {
        return ['Authorization' => 'Bearer '.$tokens['access_token']];
    }

    public function test_delete_disables_the_account_and_revokes_sessions(): void
    {
        $user = $this->user();
        $tokens = $this->login($user);

        DeviceToken::create(['user_id' => $user->id, 'token' => 'ExponentPushToken[x]', 'platform' => 'android']);

        $this->deleteJson('/users/me', [], $this->authed($tokens))
            ->assertOk()
            ->assertJson(['status' => 'deletion_scheduled'])
            ->assertJsonStructure(['purge_after']);

        $user->refresh();
        $this->assertFalse($user->is_active);
        $this->assertNotNull($user->deletion_requested_at);

        // Every session is revoked and push tokens are gone.
        $this->assertSame(0, RefreshToken::where('user_id', $user->id)->count());
        $this->assertSame(0, DeviceToken::where('user_id', $user->id)->count());

        // The (still unexpired) access token no longer works…
        $this->getJson('/users/me', $this->authed($tokens))->assertStatus(401);

        // …and the refresh token can't mint a new session.
        $this->postJson('/auth/refresh', ['refresh_token' => $tokens['refresh_token']])
            ->assertStatus(401);
    }

    public function test_logging_back_in_during_grace_cancels_the_deletion(): void
    {
        $user = $this->user();
        $tokens = $this->login($user);
        $this->deleteJson('/users/me', [], $this->authed($tokens))->assertOk();

        $response = $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password1',
        ])->assertOk()->assertJson(['reactivated' => true]);

        $user->refresh();
        $this->assertTrue($user->is_active);
        $this->assertNull($user->deletion_requested_at);

        // Account fully functional again.
        $this->getJson('/users/me', ['Authorization' => 'Bearer '.$response->json('access_token')])
            ->assertOk();
    }

    public function test_password_reset_during_grace_cancels_the_deletion(): void
    {
        $user = $this->user();
        $tokens = $this->login($user);
        $this->deleteJson('/users/me', [], $this->authed($tokens))->assertOk();

        Mail::fake();
        $this->postJson('/auth/forgot-password', ['email' => $user->email])->assertOk();

        $code = null;
        Mail::assertSent(
            PasswordResetCodeMail::class,
            function ($mail) use (&$code) {
                $code = $mail->code;

                return true;
            }
        );

        $this->postJson('/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'newpassword99',
        ])->assertOk();

        $user->refresh();
        $this->assertTrue($user->is_active);
        $this->assertNull($user->deletion_requested_at);
    }

    public function test_admin_disabled_accounts_are_not_reactivated_by_login(): void
    {
        $user = $this->user();
        // Disabled without a deletion request = a ban, not a pending deletion.
        $user->forceFill(['is_active' => false])->save();

        $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password1',
        ])->assertStatus(403);
    }

    public function test_purge_command_deletes_only_accounts_past_the_grace_period(): void
    {
        $due = $this->user('due@example.com');
        $due->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + 1),
        ])->save();

        $pet = Pet::create(['owner_id' => $due->id, 'name' => 'Rex']);
        Document::create([
            'pet_id' => $pet->id,
            'title' => 'Vaccine card',
            'file_path' => 'documents/'.$pet->id.'/test.pdf',
            'mime' => 'application/pdf',
            'size_bytes' => 100,
        ]);

        $recent = $this->user('recent@example.com');
        $recent->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(2),
        ])->save();

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        // Past-grace account and its data are gone; recent request survives.
        $this->assertNull(User::find($due->id));
        $this->assertNull(Pet::find($pet->id));
        $this->assertNotNull(User::find($recent->id));
    }

    public function test_purge_forgets_the_networks_remembered_for_sign_in(): void
    {
        $user = $this->user('networks@example.com');
        $this->login($user);
        $key = 'login-known|'.sha1('networks@example.com');
        $this->assertTrue(Cache::has($key));

        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + 1),
        ])->save();
        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertFalse(Cache::has($key));
    }

    // ── Purge: product-analytics (PostHog) data is erased first ─────────────

    private function posthogConfigured(): void
    {
        config(['services.posthog' => [
            'key' => 'phc_test',
            'host' => 'https://us.i.posthog.com',
            'api_host' => 'https://us.posthog.com',
            'personal_api_key' => 'phx_test',
            'project_id' => '123',
        ]]);
    }

    private function dueUser(string $email, int $daysPastGrace = 1): User
    {
        $user = $this->user($email);
        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + $daysPastGrace),
        ])->save();

        return $user;
    }

    public function test_purge_erases_the_person_in_posthog_before_deleting_the_account(): void
    {
        $this->posthogConfigured();
        Http::fake(['us.posthog.com/*' => Http::response(['persons_queued_for_deletion' => 1, 'deletion_errors' => []], 202)]);
        $due = $this->dueUser('due@example.com');

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/persons/bulk_delete/')
            && $r->data()['distinct_ids'] === [(string) $due->id]
            && $r->data()['delete_events'] === true);
        $this->assertNull(User::find($due->id));
    }

    public function test_a_failed_posthog_deletion_holds_the_purge_for_a_retry(): void
    {
        $this->posthogConfigured();
        Http::fake(['us.posthog.com/*' => Http::response('down', 503)]);
        $due = $this->dueUser('due@example.com');

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        // Kept (still disabled) so tomorrow's run can erase the analytics data first.
        $this->assertNotNull(User::find($due->id));
    }

    public function test_a_user_who_logs_back_in_during_the_sweep_is_not_purged(): void
    {
        $this->posthogConfigured();
        $due = $this->dueUser('due@example.com');
        // The user cancels their deletion while the sweep waits on PostHog.
        Http::fake(function () use ($due) {
            $due->forceFill(['is_active' => true, 'deletion_requested_at' => null])->save();

            return Http::response(['deletion_errors' => []], 202);
        });

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertNotNull(User::find($due->id));
        $this->assertTrue(User::find($due->id)->is_active);
    }

    public function test_a_user_who_logs_back_in_before_the_sweep_reaches_them_keeps_their_analytics(): void
    {
        $this->posthogConfigured();
        $first = $this->dueUser('first@example.com', 2); // most overdue: handled first
        $later = $this->dueUser('later@example.com', 1);
        // While the sweep handles $first, $later logs back in.
        Http::fake(function () use ($later) {
            $later->forceFill(['is_active' => true, 'deletion_requested_at' => null])->save();

            return Http::response(['deletion_errors' => []], 202);
        });

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        Http::assertSentCount(1);
        Http::assertNotSent(fn (Request $r) => in_array((string) $later->id, $r->data()['distinct_ids'] ?? [], true));
        $this->assertNull(User::find($first->id));
        $this->assertNotNull(User::find($later->id));
    }

    public function test_an_outage_stops_calling_posthog_for_the_rest_of_the_run(): void
    {
        $this->posthogConfigured();
        Http::fake(['us.posthog.com/*' => Http::response('down', 503)]);
        $this->dueUser('a@example.com', 3);
        $this->dueUser('b@example.com', 2);
        $this->dueUser('c@example.com', 1);

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertSame(3, User::whereNotNull('deletion_requested_at')->count());
    }

    public function test_one_person_failing_does_not_hold_up_the_others(): void
    {
        $this->posthogConfigured();
        $stuck = $this->dueUser('stuck@example.com', 3);
        $b = $this->dueUser('b@example.com', 2);
        $c = $this->dueUser('c@example.com', 1);
        Http::fake(fn (Request $r) => Http::response([
            'deletion_errors' => in_array((string) $stuck->id, $r->data()['distinct_ids'], true)
                ? [['person_uuid' => 'x', 'step' => 'person']]
                : [],
        ], 202));

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        Http::assertSentCount(3);
        $this->assertNotNull(User::find($stuck->id)); // retried tomorrow
        $this->assertNull(User::find($b->id));
        $this->assertNull(User::find($c->id));
    }

    public function test_accounts_past_the_retry_window_still_get_their_attempt_during_an_outage(): void
    {
        $this->posthogConfigured();
        Http::fake(['us.posthog.com/*' => Http::response('down', 503)]);
        $window = PurgeDeletedAccounts::THIRD_PARTY_RETRY_DAYS;
        $overdue1 = $this->dueUser('o1@example.com', $window + 3);
        $overdue2 = $this->dueUser('o2@example.com', $window + 2);
        $inWindow = $this->dueUser('w@example.com', 1);

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        Http::assertSentCount(2); // both overdue accounts tried; the in-window one waits
        $this->assertNull(User::find($overdue1->id));
        $this->assertNull(User::find($overdue2->id));
        $this->assertNotNull(User::find($inWindow->id));
    }

    public function test_after_the_retry_window_the_account_is_purged_anyway_and_logged(): void
    {
        $this->posthogConfigured();
        Http::fake(['us.posthog.com/*' => Http::response('down', 503)]);
        Log::spy();
        $due = $this->dueUser('due@example.com', PurgeDeletedAccounts::THIRD_PARTY_RETRY_DAYS + 1);

        $this->artisan('accounts:purge-deleted')->assertSuccessful();

        $this->assertNull(User::find($due->id));
        Log::shouldHaveReceived('error')->withArgs(fn ($message) => str_contains($message, 'PostHog deletion kept failing'));
    }

    // ── Reactivation vs purge: never "restored" and then lost ───────────────

    public function test_cancel_pending_deletion_only_succeeds_while_the_deletion_is_pending(): void
    {
        $user = $this->user();
        $user->forceFill(['is_active' => false, 'deletion_requested_at' => now()->subDay()])->save();

        $this->assertTrue($user->cancelPendingDeletion('password'));
        $this->assertTrue($user->fresh()->is_active);
        $this->assertNull($user->fresh()->deletion_requested_at);

        // A stale copy (e.g. a login that waited on the purge's lock) changes nothing.
        $stale = $user->replicate()->forceFill(['id' => $user->id, 'is_active' => false, 'deletion_requested_at' => now()]);
        $this->assertFalse($stale->cancelPendingDeletion('password'));
    }

    public function test_a_purged_account_cannot_be_reactivated_by_a_late_login(): void
    {
        $user = $this->user();
        $user->forceFill(['is_active' => false, 'deletion_requested_at' => now()->subDay()])->save();
        $stale = User::find($user->id);
        User::whereKey($user->id)->delete(); // the purge won the race

        $this->assertFalse($stale->cancelPendingDeletion('password'));
    }

    public function test_an_active_account_is_never_due_for_purge(): void
    {
        $user = $this->user();
        $user->forceFill([
            'is_active' => true,
            'deletion_requested_at' => now()->subDays(User::DELETION_GRACE_DAYS + 5),
        ])->save();

        $this->assertSame(0, User::dueForPurge()->count());
        $this->artisan('accounts:purge-deleted')->assertSuccessful();
        $this->assertNotNull(User::find($user->id));
    }

    public function test_files_are_only_removed_once_the_delete_commits(): void
    {
        Storage::fake('local');
        $user = $this->user();
        $pet = Pet::create(['owner_id' => $user->id, 'name' => 'Rex']);
        Storage::disk('local')->put('documents/rolled-back.pdf', 'pdf');
        Storage::disk('local')->put('documents/committed.pdf', 'pdf');
        $rolledBack = Document::create(['pet_id' => $pet->id, 'title' => 'A', 'file_path' => 'documents/rolled-back.pdf', 'mime' => 'application/pdf', 'size_bytes' => 3]);
        $committed = Document::create(['pet_id' => $pet->id, 'title' => 'B', 'file_path' => 'documents/committed.pdf', 'mime' => 'application/pdf', 'size_bytes' => 3]);

        try {
            DB::transaction(function () use ($rolledBack) {
                $rolledBack->delete();
                throw new \RuntimeException('purge failed half-way');
            });
        } catch (\RuntimeException) {
        }
        DB::transaction(fn () => $committed->delete());

        $this->assertNotNull(Document::find($rolledBack->id));
        Storage::disk('local')->assertExists('documents/rolled-back.pdf');
        Storage::disk('local')->assertMissing('documents/committed.pdf');
    }
}
