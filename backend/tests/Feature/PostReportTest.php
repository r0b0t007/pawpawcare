<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\PostReport;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PostReportTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(string $name = 'Reporter'): array
    {
        $user = User::create([
            'name' => $name,
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$user, JwtService::createAccessToken($user->id)];
    }

    private function makePost(User $author, string $content = 'Look at my dog'): Post
    {
        return Post::create(['author_id' => $author->id, 'content' => $content]);
    }

    public function test_reporting_a_post_sets_reported_by_me(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user();
        $post = $this->makePost($author);

        $body = $this->withToken($token)
            ->postJson("/community/posts/{$post->id}/report")
            ->assertOk()
            ->json();

        $this->assertTrue($body['reported_by_me']);
        $this->assertSame(1, PostReport::where('post_id', $post->id)->count());

        // The flag persists through a feed refresh.
        $feed = $this->withToken($token)->getJson('/community/posts')->assertOk()->json();
        $this->assertTrue(collect($feed)->firstWhere('id', $post->id)['reported_by_me']);
    }

    public function test_report_counts_never_leak_into_the_payload(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user();
        $post = $this->makePost($author);

        $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $body = $this->withToken($token)->getJson('/community/posts')->assertOk()->json();
        foreach ($body as $p) {
            foreach (array_keys($p) as $key) {
                $this->assertStringNotContainsString('report_count', $key);
                $this->assertStringNotContainsString('reports_count', $key);
            }
        }
    }

    public function test_reporting_twice_is_an_idempotent_200(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user();
        $post = $this->makePost($author);

        $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();
        $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $this->assertSame(1, PostReport::where('post_id', $post->id)->count());
    }

    public function test_unique_constraint_blocks_duplicate_rows(): void
    {
        [$author] = $this->user('Author');
        [$reporter] = $this->user();
        $post = $this->makePost($author);

        PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);

        $this->expectException(UniqueConstraintViolationException::class);
        PostReport::create(['user_id' => $reporter->id, 'post_id' => $post->id]);
    }

    public function test_undo_removes_the_report(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user();
        $post = $this->makePost($author);

        $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();

        $body = $this->withToken($token)
            ->deleteJson("/community/posts/{$post->id}/report")
            ->assertOk()
            ->json();

        $this->assertFalse($body['reported_by_me']);
        $this->assertSame(0, PostReport::count());
    }

    public function test_three_reports_hide_the_post_from_others_but_not_the_author(): void
    {
        [$author, $authorToken] = $this->user('Author');
        [, $bystanderToken] = $this->user('Bystander');
        $post = $this->makePost($author, 'Controversial take');

        foreach (range(1, 3) as $i) {
            [, $token] = $this->user("Reporter {$i}");
            $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();
        }

        // Gone for an uninvolved user…
        $feed = $this->withToken($bystanderToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertNull(collect($feed)->firstWhere('id', $post->id));

        // …but the author still sees their own post.
        $ownFeed = $this->withToken($authorToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertNotNull(collect($ownFeed)->firstWhere('id', $post->id));
    }

    public function test_two_reports_do_not_hide_the_post(): void
    {
        [$author] = $this->user('Author');
        [, $bystanderToken] = $this->user('Bystander');
        $post = $this->makePost($author);

        foreach (range(1, 2) as $i) {
            [, $token] = $this->user("Reporter {$i}");
            $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();
        }

        $feed = $this->withToken($bystanderToken)->getJson('/community/posts')->assertOk()->json();
        $this->assertNotNull(collect($feed)->firstWhere('id', $post->id));
    }

    public function test_cannot_report_a_nonexistent_post(): void
    {
        [, $token] = $this->user();

        $this->withToken($token)
            ->postJson('/community/posts/00000000-0000-0000-0000-000000000000/report')
            ->assertStatus(404);
    }

    public function test_requires_authentication(): void
    {
        [$author] = $this->user('Author');
        $post = $this->makePost($author);

        $this->postJson("/community/posts/{$post->id}/report")->assertStatus(401);
        $this->deleteJson("/community/posts/{$post->id}/report")->assertStatus(401);
    }

    public function test_reporting_is_rate_limited_per_user(): void
    {
        [$author] = $this->user('Author');
        [, $token] = $this->user();

        for ($i = 0; $i < 10; $i++) {
            $post = $this->makePost($author, "post {$i}");
            $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertOk();
        }

        $post = $this->makePost($author, 'one too many');
        $this->withToken($token)->postJson("/community/posts/{$post->id}/report")->assertStatus(429);
    }
}
