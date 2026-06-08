<?php

namespace Tests\Feature;

use App\Models\Comment;
use App\Models\Post;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CommentTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: string} */
    private function user(): array
    {
        $u = User::create([
            'name' => 'U'.uniqid(),
            'email' => 'u'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'),
            'timezone' => 'UTC',
        ]);

        return [$u, JwtService::createAccessToken($u->id)];
    }

    private function makePost(User $author): Post
    {
        return Post::create(['author_id' => $author->id, 'content' => 'Hello']);
    }

    public function test_adding_a_comment_and_listing(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);

        $comment = $this->withToken($token)->postJson("/community/posts/{$post->id}/comments", [
            'content' => 'Such a cute pup!',
        ])->assertCreated()->json();

        $this->assertSame('Such a cute pup!', $comment['content']);
        $this->assertSame($author->name, $comment['author_name']);

        $list = $this->withToken($token)->getJson("/community/posts/{$post->id}/comments")->json();
        $this->assertCount(1, $list);
    }

    public function test_post_feed_includes_comment_count(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);
        Comment::create(['post_id' => $post->id, 'author_id' => $author->id, 'content' => 'a']);
        Comment::create(['post_id' => $post->id, 'author_id' => $author->id, 'content' => 'b']);

        $feed = $this->withToken($token)->getJson('/community/posts')->json();
        $this->assertSame(2, $feed[0]['comment_count']);
    }

    public function test_comment_requires_existing_post(): void
    {
        [, $token] = $this->user();

        $this->withToken($token)->postJson('/community/posts/missing/comments', ['content' => 'x'])
            ->assertNotFound();
    }

    public function test_author_can_delete_own_comment(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);
        $id = $this->withToken($token)->postJson("/community/posts/{$post->id}/comments", ['content' => 'mine'])->json('id');

        $this->withToken($token)->deleteJson("/community/posts/{$post->id}/comments/{$id}")->assertNoContent();
        $this->assertSame(0, Comment::count());
    }

    public function test_post_owner_can_delete_others_comment_but_strangers_cannot(): void
    {
        [$owner, $ownerToken] = $this->user();
        [$commenter, $commenterToken] = $this->user();
        [, $strangerToken] = $this->user();
        $post = $this->makePost($owner);

        $id = $this->withToken($commenterToken)->postJson("/community/posts/{$post->id}/comments", ['content' => 'hi'])->json('id');

        // A stranger cannot delete it.
        $this->withToken($strangerToken)->deleteJson("/community/posts/{$post->id}/comments/{$id}")->assertForbidden();
        // The post owner can moderate it.
        $this->withToken($ownerToken)->deleteJson("/community/posts/{$post->id}/comments/{$id}")->assertNoContent();
    }

    public function test_deleting_a_post_removes_its_comments(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);
        Comment::create(['post_id' => $post->id, 'author_id' => $author->id, 'content' => 'a']);

        $this->withToken($token)->deleteJson("/community/posts/{$post->id}")->assertNoContent();
        $this->assertSame(0, Comment::count());
    }

    public function test_empty_comment_is_rejected(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);

        $this->withToken($token)->postJson("/community/posts/{$post->id}/comments", ['content' => ''])
            ->assertStatus(422);
    }

    public function test_overlong_comment_is_rejected(): void
    {
        [$author, $token] = $this->user();
        $post = $this->makePost($author);

        $this->withToken($token)->postJson("/community/posts/{$post->id}/comments", [
            'content' => str_repeat('a', 2001),
        ])->assertStatus(422);
    }
}
