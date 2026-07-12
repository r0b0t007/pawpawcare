<?php

namespace Tests\Feature;

use App\Models\Comment;
use App\Models\Post;
use App\Models\PostReport;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminModerationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(string $name = 'Someone', bool $admin = false): array
    {
        $user = User::create([
            'name' => $name,
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        if ($admin) {
            // Mirrors the artisan command: is_admin is not fillable.
            $user->forceFill(['is_admin' => true])->save();
        }

        return [$user, JwtService::createAccessToken($user->id)];
    }

    /** @return array{0: User, 1: string} */
    private function admin(): array
    {
        return $this->user('Admin', admin: true);
    }

    private function makePost(User $author, string $content = 'Look at my dog'): Post
    {
        return Post::create(['author_id' => $author->id, 'content' => $content]);
    }

    /** Attach $count reports from freshly minted users. */
    private function reportTimes(Post $post, int $count): void
    {
        foreach (range(1, $count) as $i) {
            [$reporter] = $this->user("Reporter {$i}");
            PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);
        }
    }

    // ── Access control ───────────────────────────────────────────────────────

    public function test_non_admins_get_403_on_every_admin_endpoint(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user('Regular');
        $post = $this->makePost($author);

        $this->withToken($token)->getJson('/admin/reports')
            ->assertStatus(403)->assertJson(['detail' => 'Forbidden']);
        $this->withToken($token)->postJson("/admin/posts/{$post->id}/dismiss-reports")
            ->assertStatus(403)->assertJson(['detail' => 'Forbidden']);
        $this->withToken($token)->deleteJson("/admin/posts/{$post->id}")
            ->assertStatus(403)->assertJson(['detail' => 'Forbidden']);

        $this->assertNotNull(Post::find($post->id));
    }

    public function test_admin_endpoints_require_authentication(): void
    {
        $this->getJson('/admin/reports')->assertStatus(401);
        $this->postJson('/admin/posts/x/dismiss-reports')->assertStatus(401);
        $this->deleteJson('/admin/posts/x')->assertStatus(401);
    }

    // ── The queue ────────────────────────────────────────────────────────────

    public function test_queue_shows_counts_and_includes_auto_hidden_posts(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');

        $clean = $this->makePost($author, 'never reported');
        $flagged = $this->makePost($author, 'reported twice');
        $hidden = $this->makePost($author, 'reported thrice');
        $this->reportTimes($flagged, 2);
        $this->reportTimes($hidden, 3);

        $queue = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json('items');

        $this->assertCount(2, $queue);
        $this->assertNull(collect($queue)->firstWhere('post.id', $clean->id));

        $flaggedEntry = collect($queue)->firstWhere('post.id', $flagged->id);
        $this->assertSame(2, $flaggedEntry['report_count']);
        $this->assertFalse($flaggedEntry['hidden']);
        $this->assertSame('Author', $flaggedEntry['post']['author_name']);
        $this->assertSame('reported twice', $flaggedEntry['post']['content']);

        // The auto-hidden post (invisible in the community feed) IS here.
        $hiddenEntry = collect($queue)->firstWhere('post.id', $hidden->id);
        $this->assertSame(3, $hiddenEntry['report_count']);
        $this->assertTrue($hiddenEntry['hidden']);
        $this->assertNotNull($hiddenEntry['latest_reported_at']);
    }

    public function test_queue_orders_by_newest_report_first(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');

        $old = $this->makePost($author, 'reported a while ago');
        $fresh = $this->makePost($author, 'reported just now');

        [$r1] = $this->user('Reporter old');
        PostReport::create(['user_id' => $r1->id, 'post_id' => $old->id])
            ->forceFill(['created_at' => now()->subDay()])->save();
        [$r2] = $this->user('Reporter new');
        PostReport::create(['user_id' => $r2->id, 'post_id' => $fresh->id]);

        $queue = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json('items');

        $this->assertSame($fresh->id, $queue[0]['post']['id']);
        $this->assertSame($old->id, $queue[1]['post']['id']);
    }

    public function test_queue_never_exposes_reporter_identities(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author);
        $this->reportTimes($post, 2);

        $entry = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json('items')[0];

        // Only aggregate metadata at the top level…
        $this->assertEqualsCanonicalizing(
            ['post', 'report_count', 'latest_reported_at', 'hidden'],
            array_keys($entry),
        );
        // …and nothing reporter-shaped inside the post payload either.
        foreach (array_keys($entry['post']) as $key) {
            $this->assertStringNotContainsString('reporter', $key);
            $this->assertStringNotContainsString('user_id', $key);
        }
    }

    // ── Pagination ───────────────────────────────────────────────────────────

    public function test_queue_is_paginated(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');

        // 25 reported posts, one report each — two pages at the default of 20.
        foreach (range(1, 25) as $i) {
            $post = $this->makePost($author, "reported post {$i}");
            [$reporter] = $this->user("Reporter {$i}");
            PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);
        }

        $page1 = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json();
        $this->assertCount(20, $page1['items']);
        $this->assertSame(1, $page1['page']);
        $this->assertSame(25, $page1['total']);
        $this->assertTrue($page1['has_more']);

        $page2 = $this->withToken($adminToken)->getJson('/admin/reports?page=2')->assertOk()->json();
        $this->assertCount(5, $page2['items']);
        $this->assertSame(2, $page2['page']);
        $this->assertFalse($page2['has_more']);

        // No post appears on both pages.
        $ids1 = collect($page1['items'])->pluck('post.id');
        $ids2 = collect($page2['items'])->pluck('post.id');
        $this->assertCount(25, $ids1->merge($ids2)->unique());
    }

    public function test_per_page_is_capped(): void
    {
        [, $adminToken] = $this->admin();

        // Asking for an absurd page size is clamped, not honoured verbatim.
        $body = $this->withToken($adminToken)->getJson('/admin/reports?per_page=9999')->assertOk()->json();
        $this->assertSame(50, $body['per_page']);
    }

    // ── Dismiss ──────────────────────────────────────────────────────────────

    public function test_dismiss_soft_marks_reports_and_restores_feed_visibility(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        [, $bystanderToken] = $this->user('Bystander');
        $post = $this->makePost($author, 'wrongly flagged');
        $this->reportTimes($post, 3);

        // Auto-hidden from a regular user's feed…
        $feed = $this->withToken($bystanderToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertNull(collect($feed)->firstWhere('id', $post->id));

        $this->withToken($adminToken)
            ->postJson("/admin/posts/{$post->id}/dismiss-reports")
            ->assertOk()
            ->assertJson(['status' => 'ok']);

        // Rows are preserved as an audit trail — dismissed, not deleted.
        $this->assertSame(3, PostReport::where('post_id', $post->id)->count());
        $this->assertSame(0, PostReport::where('post_id', $post->id)->whereNull('dismissed_at')->count());

        // …and the post is back for everyone (it fell below the active-report
        // hide threshold) and gone from the review queue.
        $feed = $this->withToken($bystanderToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertNotNull(collect($feed)->firstWhere('id', $post->id));

        $queue = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json('items');
        $this->assertCount(0, $queue);
    }

    public function test_dismiss_clears_reported_by_me_for_the_original_reporter(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author, 'flagged then cleared');

        [$reporter, $reporterToken] = $this->user('Reporter');
        PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);

        // Before dismiss the reporter's own feed marks the post reported.
        $feed = $this->withToken($reporterToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertTrue(collect($feed)->firstWhere('id', $post->id)['reported_by_me']);

        $this->withToken($adminToken)->postJson("/admin/posts/{$post->id}/dismiss-reports")->assertOk();

        // After dismiss the report no longer counts — the card un-collapses.
        $feed = $this->withToken($reporterToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertFalse(collect($feed)->firstWhere('id', $post->id)['reported_by_me']);
    }

    // ── Re-queue behaviour after a dismissal ─────────────────────────────────

    public function test_a_new_reporter_requeues_a_dismissed_post(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author, 'flagged, cleared, then flagged again');
        $this->reportTimes($post, 2);

        $this->withToken($adminToken)->postJson("/admin/posts/{$post->id}/dismiss-reports")->assertOk();
        $this->assertCount(0, $this->withToken($adminToken)->getJson('/admin/reports')->json('items'));

        // A different user reporting reopens the queue immediately.
        [, $freshToken] = $this->user('Fresh eyes');
        $this->withToken($freshToken)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $queue = $this->withToken($adminToken)->getJson('/admin/reports')->assertOk()->json('items');
        $this->assertCount(1, $queue);
        $this->assertSame(1, $queue[0]['report_count']);
    }

    public function test_same_reporter_cannot_immediately_requeue_after_dismiss(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author, 'flagged then cleared');

        [$reporter, $reporterToken] = $this->user('Persistent');
        PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);

        $this->withToken($adminToken)->postJson("/admin/posts/{$post->id}/dismiss-reports")->assertOk();

        // Re-reporting inside the cooldown is a no-op — the dismissal stands.
        $this->withToken($reporterToken)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $this->assertSame(0, PostReport::where('post_id', $post->id)->whereNull('dismissed_at')->count());
        $this->assertCount(0, $this->withToken($adminToken)->getJson('/admin/reports')->json('items'));
    }

    public function test_undo_report_cannot_erase_a_dismissal_or_dodge_the_cooldown(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author, 'flagged then cleared');

        [$reporter, $reporterToken] = $this->user('Sneaky');
        PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);

        $this->withToken($adminToken)->postJson("/admin/posts/{$post->id}/dismiss-reports")->assertOk();

        // Undo-then-report must not mint a fresh active row: the dismissed row
        // survives (audit trail) and the cooldown still holds.
        $this->withToken($reporterToken)->deleteJson("/community/posts/{$post->id}/report")->assertOk();
        $this->assertSame(1, PostReport::where('post_id', $post->id)->whereNotNull('dismissed_at')->count());

        $this->withToken($reporterToken)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $this->assertSame(0, PostReport::where('post_id', $post->id)->whereNull('dismissed_at')->count());
        $this->assertCount(0, $this->withToken($adminToken)->getJson('/admin/reports')->json('items'));
    }

    public function test_same_reporter_can_requeue_after_the_cooldown(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        $post = $this->makePost($author, 'flagged, cleared long ago');

        [$reporter, $reporterToken] = $this->user('Patient');
        $report = PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);
        // Dismissed well beyond the cooldown window.
        $report->forceFill(['dismissed_at' => now()->subDays(PostReport::DISMISS_COOLDOWN_DAYS + 1)])->save();

        $this->assertCount(0, $this->withToken($adminToken)->getJson('/admin/reports')->json('items'));

        $this->withToken($reporterToken)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $this->assertSame(1, PostReport::where('post_id', $post->id)->whereNull('dismissed_at')->count());
        $this->assertCount(1, $this->withToken($adminToken)->getJson('/admin/reports')->json('items'));
    }

    public function test_dismissing_a_nonexistent_post_is_404(): void
    {
        [, $adminToken] = $this->admin();

        $this->withToken($adminToken)
            ->postJson('/admin/posts/00000000-0000-0000-0000-000000000000/dismiss-reports')
            ->assertStatus(404);
    }

    // ── Admin delete ─────────────────────────────────────────────────────────

    public function test_admin_delete_removes_post_reports_and_comments(): void
    {
        [, $adminToken] = $this->admin();
        [$author] = $this->user('Author');
        [$commenter] = $this->user('Commenter');
        $post = $this->makePost($author, 'over the line');
        $this->reportTimes($post, 3);
        Comment::create(['post_id' => $post->id, 'author_id' => $commenter->id, 'content' => 'yikes']);

        // The admin is NOT the author — the community route would 403 this.
        $this->withToken($adminToken)
            ->deleteJson("/admin/posts/{$post->id}")
            ->assertStatus(204);

        $this->assertNull(Post::find($post->id));
        $this->assertSame(0, PostReport::where('post_id', $post->id)->count());
        $this->assertSame(0, Comment::where('post_id', $post->id)->count());
    }

    public function test_deleting_a_nonexistent_post_is_404(): void
    {
        [, $adminToken] = $this->admin();

        $this->withToken($adminToken)
            ->deleteJson('/admin/posts/00000000-0000-0000-0000-000000000000')
            ->assertStatus(404);
    }

    // ── is_admin can never be self-granted ───────────────────────────────────

    public function test_is_admin_cannot_be_set_via_signup(): void
    {
        $this->postJson('/auth/signup', [
            'name' => 'Sneaky',
            'email' => 'sneaky@example.com',
            'password' => 'secret123',
            'is_admin' => true,
        ])->assertStatus(201);

        $this->assertFalse(User::where('email', 'sneaky@example.com')->first()->is_admin);
    }

    public function test_is_admin_cannot_be_set_via_profile_patch(): void
    {
        [, $token] = $this->user('Regular');

        $body = $this->withToken($token)
            ->patchJson('/users/me', ['is_admin' => true, 'name' => 'Still Regular'])
            ->assertOk()
            ->json();

        $this->assertFalse($body['is_admin']);
        $this->assertFalse(User::where('name', 'Still Regular')->first()->is_admin);

        // And it can't slip through mass assignment on the model either.
        $victim = User::create([
            'name' => 'Filled',
            'email' => 'filled@example.com',
            'hashed_password' => Hash::make('secret123'),
            'is_admin' => true, // silently discarded — not fillable
        ]);
        $this->assertFalse($victim->fresh()->is_admin);
    }

    public function test_users_me_reports_is_admin(): void
    {
        [, $regularToken] = $this->user('Regular');
        [, $adminToken] = $this->admin();

        $this->assertFalse($this->withToken($regularToken)->getJson('/users/me')->assertOk()->json()['is_admin']);
        $this->assertTrue($this->withToken($adminToken)->getJson('/users/me')->assertOk()->json()['is_admin']);
    }

    // ── The artisan command ──────────────────────────────────────────────────

    public function test_make_admin_command_grants_and_revokes(): void
    {
        [$user] = $this->user('Owner');

        $this->artisan('user:make-admin', ['email' => $user->email])->assertSuccessful();
        $this->assertTrue($user->fresh()->is_admin);

        $this->artisan('user:make-admin', ['email' => $user->email, '--revoke' => true])->assertSuccessful();
        $this->assertFalse($user->fresh()->is_admin);
    }

    public function test_make_admin_command_fails_for_unknown_email(): void
    {
        $this->artisan('user:make-admin', ['email' => 'nobody@example.com'])->assertFailed();
    }
}
