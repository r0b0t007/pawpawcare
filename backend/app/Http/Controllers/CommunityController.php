<?php

namespace App\Http\Controllers;

use App\Models\Group;
use App\Models\Post;
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
            ->orderByDesc('created_at')
            ->skip($skip)
            ->take($limit)
            ->get();

        return response()->json($posts->map(fn (Post $p) => $p->toApi($userId)));
    }

    public function createPost(Request $request): JsonResponse
    {
        $data = $request->validate([
            'content' => 'required|string|min:1',
            'image_url' => 'sometimes|nullable|string',
            'group_id' => 'sometimes|nullable|string',
        ]);

        $post = Post::create(array_merge($data, ['author_id' => $request->user()->id]));
        $post->load(['author', 'pawedBy']);

        return response()->json($post->toApi($request->user()->id), 201);
    }

    public function deletePost(Request $request, string $postId): JsonResponse
    {
        $post = Post::find($postId);
        if (! $post) {
            abort(404, 'Post not found');
        }
        if ($post->author_id !== $request->user()->id) {
            abort(403, 'Not your post');
        }
        $post->delete();

        return response()->json(null, 204);
    }

    public function togglePaw(Request $request, string $postId): JsonResponse
    {
        $post = Post::with(['author', 'pawedBy'])->find($postId);
        if (! $post) {
            abort(404, 'Post not found');
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
            abort(404, 'Group not found');
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
