<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\PostReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Moderation endpoints for community post reports. Every route here sits
 * behind auth.jwt + the `admin` middleware — a non-admin never gets past 403.
 */
class AdminController extends Controller
{
    /**
     * The review queue: every post with at least one open report, newest
     * report first. Deliberately NOT scoped by visibleTo — auto-hidden posts
     * are exactly the ones an admin must be able to see. Reporter identities
     * are never included (reporter privacy); only counts and timestamps.
     */
    public function reports(Request $request): JsonResponse
    {
        $posts = Post::with('author')
            ->withCount('reports')
            ->addSelect(['latest_reported_at' => PostReport::select('created_at')
                ->whereColumn('post_id', 'posts.id')
                ->latest('created_at')
                ->limit(1),
            ])
            ->has('reports')
            ->orderByDesc('latest_reported_at')
            ->get();

        return response()->json($posts->map(fn (Post $p) => $this->queueEntry($p))->values());
    }

    /**
     * Dismiss every report on a post ("the reports were wrong"). Dropping the
     * rows below the hide threshold restores the post for everyone.
     */
    public function dismissReports(Request $request, string $postId): JsonResponse
    {
        $this->postOr404($postId);

        PostReport::where('post_id', $postId)->delete();

        return response()->json(['status' => 'ok']);
    }

    /**
     * Moderation removal — deletes the post regardless of author (the
     * community deletePost only allows the author). Reports, comments and
     * paws go with it via FK cascades; the Post deleting hook removes the
     * uploaded image file.
     */
    public function deletePost(Request $request, string $postId): JsonResponse
    {
        $post = $this->postOr404($postId);

        $post->delete();

        return response()->json(null, 204);
    }

    /** One review-queue entry: the post payload + report metadata. */
    private function queueEntry(Post $post): array
    {
        $count = (int) $post->reports_count;

        return [
            'post' => [
                'id' => $post->id,
                'content' => $post->content,
                'image_url' => $post->image_url,
                'author_id' => $post->author_id,
                'author_name' => $post->author?->name ?? '',
                'created_at' => $post->created_at?->toISOString(),
            ],
            'report_count' => $count,
            'latest_reported_at' => $post->latest_reported_at
                ? Carbon::parse($post->latest_reported_at)->toISOString()
                : null,
            'hidden' => $count >= Post::REPORT_HIDE_THRESHOLD,
        ];
    }

    private function postOr404(string $postId): Post
    {
        $post = Post::find($postId);
        if (! $post) {
            abort(404, 'Post not found');
        }

        return $post;
    }
}
