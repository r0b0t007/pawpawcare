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
    /** Queue page size, capped so a caller can't request the whole table. */
    private const PER_PAGE = 20;

    private const MAX_PER_PAGE = 50;

    /**
     * The review queue: every post with at least one open (non-dismissed)
     * report, newest report first, paginated. Deliberately NOT scoped by
     * visibleTo — auto-hidden posts are exactly the ones an admin must be
     * able to see. Reporter identities are never included (reporter privacy);
     * only counts and timestamps.
     */
    public function reports(Request $request): JsonResponse
    {
        $perPage = min(self::MAX_PER_PAGE, max(1, (int) $request->query('per_page', self::PER_PAGE)));

        $posts = Post::with('author')
            ->withCount('activeReports')
            ->addSelect(['latest_reported_at' => PostReport::select('created_at')
                ->whereColumn('post_id', 'posts.id')
                ->whereNull('dismissed_at')
                ->latest('created_at')
                ->limit(1),
            ])
            ->has('activeReports')
            ->orderByDesc('latest_reported_at')
            ->orderByDesc('posts.id') // stable tiebreaker so pages don't overlap
            ->paginate($perPage);

        return response()->json([
            'items' => collect($posts->items())->map(fn (Post $p) => $this->queueEntry($p))->values(),
            'page' => $posts->currentPage(),
            'last_page' => $posts->lastPage(),
            'per_page' => $posts->perPage(),
            'total' => $posts->total(),
            'has_more' => $posts->hasMorePages(),
        ]);
    }

    /**
     * Dismiss every open report on a post ("the reports were wrong"). Reports
     * are soft-marked (dismissed_at) rather than deleted, so the moderation
     * decision survives as an audit trail; dropping the active count below the
     * hide threshold restores the post for everyone.
     */
    public function dismissReports(Request $request, string $postId): JsonResponse
    {
        $this->postOr404($postId);

        PostReport::where('post_id', $postId)
            ->whereNull('dismissed_at')
            ->update(['dismissed_at' => now()]);

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
        $count = (int) $post->active_reports_count;

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
