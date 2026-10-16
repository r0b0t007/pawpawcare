<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Group;
use App\Models\Post;
use App\Models\PostReport;
use App\Support\Uploads;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommunityController extends Controller
{
    // ── Posts ──────────────────────────────────────────────────────────────

    public function listPosts(Request $request): JsonResponse
    {
        $skip = max(0, (int) $request->query('skip', 0));
        $limit = max(1, (int) $request->query('limit', 50));
        $userId = $request->user()->id;

        $posts = Post::with(['author', 'pawedBy'])
            ->withCount('comments')
            // Heavily-reported posts vanish for everyone but their author;
            // the client hides the requester's own reports via `reported_by_me`.
            ->visibleTo($userId)
            ->withExists(['reports as reported_by_me' => fn ($q) => $q->where('user_id', $userId)->whereNull('dismissed_at')])
            ->orderByDesc('created_at')
            ->skip($skip)
            ->take($limit)
            ->get();

        return response()->json($posts->map(fn (Post $p) => $p->toApi($userId)));
    }

    public function createPost(Request $request): JsonResponse
    {
        $data = $request->validate([
            'content' => 'required|string|min:1|max:5000',
            // App uploads are stored as `/storage/...` paths; also allow full
            // http(s) URLs — but never `javascript:`/`data:` and the like.
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https?://|/(?!/))#i'],
            'group_id' => 'sometimes|nullable|string|exists:groups,id',
        ]);

        Uploads::assertUsableUrl($data['image_url'] ?? null, [$request->user()->id], null, 'image_url');

        $post = Post::create(array_merge($data, ['author_id' => $request->user()->id]));
        $post->load(['author', 'pawedBy']);

        return response()->json($post->toApi($request->user()->id), 201);
    }

    public function deletePost(Request $request, string $postId): JsonResponse
    {
        $post = Post::find($postId);
        if (! $post) {
            abort(404, __('Post not found'));
        }
        if ($post->author_id !== $request->user()->id) {
            abort(403, __('Not your post'));
        }
        $post->delete();

        return response()->json(null, 204);
    }

    public function togglePaw(Request $request, string $postId): JsonResponse
    {
        $post = Post::with(['author', 'pawedBy'])->withCount('comments')->find($postId);
        if (! $post) {
            abort(404, __('Post not found'));
        }

        $userId = $request->user()->id;

        if ($post->pawedBy->contains('id', $userId)) {
            $post->pawedBy()->detach($userId);
        } else {
            $post->pawedBy()->attach($userId);
        }
        $post->load('pawedBy');

        return response()->json($post->toApi($userId));
    }

    // ── Reports ────────────────────────────────────────────────────────────

    /** Flag a post for moderation. Idempotent: reporting twice is a 200 no-op. */
    public function reportPost(Request $request, string $postId): JsonResponse
    {
        $post = $this->postOr404($postId)->load(['author', 'pawedBy'])->loadCount('comments');
        $userId = $request->user()->id;

        try {
            $report = PostReport::firstOrCreate(['user_id' => $userId, 'post_id' => $postId]);

            // If this reporter's earlier report was dismissed by an admin, it
            // only re-opens (re-queues the post) once the cooldown has passed —
            // so a dismissal can't be undone by immediately re-reporting.
            if ($report->dismissed_at
                && $report->dismissed_at->lte(now()->subDays(PostReport::DISMISS_COOLDOWN_DAYS))) {
                $report->forceFill(['dismissed_at' => null, 'created_at' => now()])->save();
            }
        } catch (UniqueConstraintViolationException) {
            // Raced with a concurrent identical report — same outcome, keep 200.
        }

        return response()->json($post->toApi($userId));
    }

    /** Undo the requesting user's own report ("Undo" on the hidden card). */
    public function unreportPost(Request $request, string $postId): JsonResponse
    {
        $post = $this->postOr404($postId)->load(['author', 'pawedBy'])->loadCount('comments');
        $userId = $request->user()->id;

        // Only an OPEN report can be undone. A report an admin already
        // dismissed stays on record — deleting it would both erase the audit
        // trail and let the reporter escape the re-report cooldown by
        // undo-then-report to mint a fresh active row.
        PostReport::where('user_id', $userId)
            ->where('post_id', $postId)
            ->whereNull('dismissed_at')
            ->delete();

        return response()->json($post->toApi($userId));
    }

    // ── Comments ───────────────────────────────────────────────────────────

    public function listComments(Request $request, string $postId): JsonResponse
    {
        $this->postOr404($postId);

        $comments = Comment::with('author')
            ->where('post_id', $postId)
            ->orderBy('created_at')
            ->get();

        return response()->json($comments->map->toApi());
    }

    public function addComment(Request $request, string $postId): JsonResponse
    {
        $this->postOr404($postId);

        $data = $request->validate([
            'content' => 'required|string|min:1|max:2000',
        ]);

        $comment = Comment::create([
            'post_id' => $postId,
            'author_id' => $request->user()->id,
            'content' => $data['content'],
        ]);
        $comment->load('author');

        return response()->json($comment->toApi(), 201);
    }

    public function deleteComment(Request $request, string $postId, string $commentId): JsonResponse
    {
        $comment = Comment::where('id', $commentId)->where('post_id', $postId)->first();
        if (! $comment) {
            abort(404, __('Comment not found'));
        }
        // The comment's author, or the post's owner, may delete it.
        $post = Post::find($postId);
        if ($comment->author_id !== $request->user()->id && $post?->author_id !== $request->user()->id) {
            abort(403, __('Not allowed'));
        }
        $comment->delete();

        return response()->json(null, 204);
    }

    private function postOr404(string $postId): Post
    {
        $post = Post::find($postId);
        if (! $post) {
            abort(404, __('Post not found'));
        }

        return $post;
    }

    // ── Groups ─────────────────────────────────────────────────────────────

    public function listGroups(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $groups = Group::with('members')->get();

        return response()->json($groups->map(fn (Group $g) => $g->toApi($userId)));
    }

    public function toggleGroup(Request $request, string $groupId): JsonResponse
    {
        $group = Group::with('members')->find($groupId);
        if (! $group) {
            abort(404, __('Group not found'));
        }

        $userId = $request->user()->id;

        if ($group->members->contains('id', $userId)) {
            $group->members()->detach($userId);
        } else {
            $group->members()->attach($userId);
        }
        $group->load('members');

        return response()->json($group->toApi($userId));
    }
}
