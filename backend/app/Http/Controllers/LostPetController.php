<?php

namespace App\Http\Controllers;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\Post;
use App\Support\Uploads;
use Illuminate\Database\Eloquent\Builder;
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

        return response()->json($this->withIsMine($request, $reports));
    }

    /**
     * My reports (active + resolved): those on the pets I own or share, whoever
     * in the family filed them, so every co-owner sees that a pet is lost and
     * can mark it found — and those I filed, so someone who left a shared pet
     * can still take down an alert carrying their phone number.
     */
    public function mine(Request $request): JsonResponse
    {
        $reports = $this->mineQuery($request)
            ->with(['pet', 'reporter'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($this->withIsMine($request, $reports));
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
            'description' => 'sometimes|nullable|string|max:5000',
            'contact_phone' => 'sometimes|nullable|string|max:40',
            'photo_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https?://|/(?!/))#i'],
        ]);

        $report = LostPetReport::where('pet_id', $pet->id)->where('status', 'active')->first();
        $isNew = ! $report;

        Uploads::assertUsableUrl($data['photo_url'] ?? null, $pet->participantIds(), $report?->photo_url, 'photo_url');

        // Reporting a pet that is already on the board updates its report. Only
        // the fields sent change: one left out keeps what is there (the app
        // leaves blank fields out, so a co-owner's blank form never erases the
        // last-seen place or the contact phone), and an explicit null or empty
        // value (Laravel turns '' into null) clears it, so a phone shared by
        // mistake comes off the board without taking the alert down. The
        // report stays with whoever filed it.
        $report ??= new LostPetReport(['pet_id' => $pet->id, 'reported_by' => $request->user()->id, 'status' => 'active']);
        $report->fill($data);
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

        return response()->json($report->toApi() + ['is_mine' => true], $isNew ? 201 : 200);
    }

    /** Mark a report resolved (an owner or co-owner of the pet, or whoever filed it) and remove its feed post. */
    public function resolve(Request $request, string $reportId): JsonResponse
    {
        $data = $request->validate([
            'resolution_note' => 'sometimes|nullable|string|max:200',
        ]);

        $report = $this->mineQuery($request)->where('id', $reportId)->first();

        if (! $report) {
            abort(404, __('Report not found'));
        }

        if ($report->status !== 'active') {
            abort(409, __('Report already resolved'));
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

        return response()->json($report->toApi() + ['is_mine' => true]);
    }

    /**
     * Reports on a pet I own or share, or active ones I filed: the ones I may
     * see as mine and mark found. A filer who left the pet keeps only that —
     * taking down an alert that may carry their phone — not the pet's history.
     */
    private function mineQuery(Request $request): Builder
    {
        $userId = $request->user()->id;

        return LostPetReport::where(function (Builder $q) use ($userId) {
            $q->whereIn('pet_id', Pet::accessibleBy($userId)->select('id'))
                ->orWhere(fn (Builder $own) => $own->where('reported_by', $userId)->where('status', 'active'));
        });
    }

    /**
     * Serialize reports with `is_mine`: whether the viewer may treat the report
     * as theirs and mark the pet found (see mineQuery) — not only who filed it.
     *
     * @param  iterable<LostPetReport>  $reports
     * @return list<array<string, mixed>>
     */
    private function withIsMine(Request $request, iterable $reports): array
    {
        $userId = $request->user()->id;
        $myPets = Pet::accessibleBy($userId)->pluck('id')->flip();

        return collect($reports)
            ->map(fn (LostPetReport $report) => $report->toApi() + [
                'is_mine' => $myPets->has($report->pet_id)
                    || ($report->reported_by === $userId && $report->status === 'active'),
            ])
            ->values()
            ->all();
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
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        return $pet;
    }
}
