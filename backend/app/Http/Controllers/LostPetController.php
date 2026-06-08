<?php

namespace App\Http\Controllers;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LostPetController extends Controller
{
    /** Community-wide board of active lost-pet alerts. */
    public function index(Request $request): JsonResponse
    {
        $skip = max(0, (int) $request->query('skip', 0));
        $limit = max(1, (int) $request->query('limit', 50));

        $reports = LostPetReport::with(['pet', 'reporter'])
            ->where('status', 'active')
            ->orderByDesc('created_at')
            ->skip($skip)
            ->take($limit)
            ->get();

        return response()->json($reports->map->toApi());
    }

    /** The current user's own reports (active + resolved). */
    public function mine(Request $request): JsonResponse
    {
        $reports = LostPetReport::with(['pet', 'reporter'])
            ->where('reported_by', $request->user()->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($reports->map->toApi());
    }

    /** Report a pet lost (owner only) — upserts the active report and broadcasts to the feed. */
    public function report(Request $request, string $petId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $data = $request->validate([
            'last_seen_location' => 'sometimes|nullable|string|max:200',
            'last_seen_at' => 'sometimes|nullable|date',
            'latitude' => 'sometimes|nullable|numeric',
            'longitude' => 'sometimes|nullable|numeric',
            'description' => 'sometimes|nullable|string',
            'contact_phone' => 'sometimes|nullable|string|max:40',
            'photo_url' => 'sometimes|nullable|string',
        ]);

        $report = LostPetReport::where('pet_id', $pet->id)->where('status', 'active')->first();
        $isNew = ! $report;

        $report ??= new LostPetReport(['pet_id' => $pet->id, 'reported_by' => $request->user()->id, 'status' => 'active']);
        $report->fill($data);
        $report->reported_by = $request->user()->id;
        $report->status = 'active';
        $report->save();

        // Broadcast into the community feed (reusing posts); keep it in sync on re-report.
        if ($isNew) {
            $post = Post::create([
                'author_id' => $request->user()->id,
                'content' => $this->broadcastContent($pet, $report),
            ]);
            $report->post_id = $post->id;
            $report->save();
        } elseif ($report->post_id) {
            Post::where('id', $report->post_id)->update([
                'content' => $this->broadcastContent($pet, $report),
            ]);
        }

        $report->load(['pet', 'reporter']);

        return response()->json($report->toApi(), $isNew ? 201 : 200);
    }

    /** Mark a report resolved (owner only) and remove its feed post. */
    public function resolve(Request $request, string $reportId): JsonResponse
    {
        $data = $request->validate([
            'resolution_note' => 'sometimes|nullable|string|max:200',
        ]);

        $report = LostPetReport::where('id', $reportId)
            ->where('reported_by', $request->user()->id)
            ->first();

        if (! $report) {
            abort(404, 'Report not found');
        }

        if ($report->status !== 'active') {
            abort(409, 'Report already resolved');
        }

        if ($report->post_id) {
            Post::where('id', $report->post_id)->delete();
            $report->post_id = null;
        }

        $report->status = 'resolved';
        $report->resolved_at = now();
        $report->resolution_note = $data['resolution_note'] ?? null;
        $report->save();

        $report->load(['pet', 'reporter']);

        return response()->json($report->toApi());
    }

    private function broadcastContent(Pet $pet, LostPetReport $report): string
    {
        $parts = ["🚨 LOST PET: {$pet->name}".($pet->type ? " ({$pet->type})" : '').'.'];

        if ($report->last_seen_location) {
            $when = $report->last_seen_at ? ' on '.Carbon::parse($report->last_seen_at)->format('M j') : '';
            $parts[] = "Last seen near {$report->last_seen_location}{$when}.";
        }
        if ($report->description) {
            $parts[] = $report->description;
        }
        if ($report->contact_phone) {
            $parts[] = "Please contact {$report->contact_phone} if seen.";
        }

        return implode(' ', $parts);
    }

    private function petOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::where('id', $petId)->where('owner_id', $request->user()->id)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }
}
