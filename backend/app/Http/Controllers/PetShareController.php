<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\Pet;
use App\Services\Analytics\ProductAnalytics;
use App\Support\PublicPageLocale;
use App\Support\WeightInsight;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * Vet share links: a time-limited, read-only web view of a pet's medical
 * summary (vaccinations, medications, weight, clinics, documents) that a vet
 * can open in any browser — no account, no app.
 *
 * Same trust model as signed document delivery: the JWT-guarded mint endpoint
 * does the pet access check, and the page route is gated only by the URL
 * signature + expiry.
 */
class PetShareController extends Controller
{
    private const EXPIRIES = ['1h' => 60, '24h' => 60 * 24, '7d' => 60 * 24 * 7];

    /** Mint a share link (owner or co-owner). */
    public function create(Request $request, string $petId, ProductAnalytics $analytics): JsonResponse
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        $data = $request->validate([
            'expires_in' => 'sometimes|in:1h,24h,7d',
        ]);

        // Mint the link against the pet's current share token, so revoking
        // (rotating the token) invalidates this and every other live link.
        if (! $pet->share_token) {
            $pet->forceFill(['share_token' => Str::random(40)])->save();
        }

        $expiresIn = $data['expires_in'] ?? '24h';
        $expiresAt = now()->addMinutes(self::EXPIRIES[$expiresIn]);
        // The creator's language rides inside the signed part of the URL
        // (none for English), so the page opens in it for a signed-out vet.
        $url = URL::temporarySignedRoute('pets.share', $expiresAt, [
            'pet' => $pet->id,
            't' => $pet->share_token,
        ] + PublicPageLocale::linkParams());

        $analytics->capture($request->user(), 'server_share_link_created', ['expires_in' => $expiresIn]);

        return response()->json([
            'url' => $url,
            'expires_at' => $expiresAt->toISOString(),
        ]);
    }

    /** Revoke every outstanding share link for a pet by rotating its token. */
    public function revoke(Request $request, string $petId): JsonResponse
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        $pet->forceFill(['share_token' => Str::random(40)])->save();

        return response()->json(null, 204);
    }

    /**
     * Render the share page behind a valid signature. NOT JWT-guarded — the
     * signature, minted only for a user with pet access, is the authorization.
     */
    public function show(Request $request, string $petId)
    {
        $pet = Pet::with([
            'vaccinations' => fn ($q) => $q->orderByDesc('due_date'),
            'medications' => fn ($q) => $q->where('active', true)->orderBy('name'),
            'weightLogs' => fn ($q) => $q->orderByDesc('logged_at')->orderByDesc('created_at')->limit(12),
            'clinics' => fn ($q) => $q->orderBy('name'),
            'documents' => fn ($q) => $q->orderByDesc('created_at')->limit(10),
        ])->find($petId);

        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        // The signature is valid (middleware passed), but the embedded token
        // must still match the pet's current one — a rotated token means this
        // link was revoked. 410 Gone distinguishes it from a tampered 403.
        if (! $pet->share_token || ! hash_equals($pet->share_token, (string) $request->query('t'))) {
            abort(410, __('This share link has been revoked.'));
        }

        // Only the page itself takes the link's language: the signed `lang`,
        // or the viewer's unsigned `hl` display override (ignored by the
        // route's signature check; language only). The 404/410 above keep
        // SetLocale's browser-language pick, like the signed middleware's 403.
        $locale = PublicPageLocale::apply($request, allowDisplayOverride: true);

        // Document links piggyback on this page's own expiry (the `expires`
        // query param the signature covers), so they die with the share link.
        $expiresAt = Carbon::createFromTimestamp((int) $request->query('expires'));
        $documents = $pet->documents->map(fn (Document $d) => [
            'title' => $d->title,
            'category' => $d->category,
            'created_at' => $d->created_at,
            'url' => URL::temporarySignedRoute('documents.raw', $expiresAt, ['document' => $d->id]),
        ]);

        return response()
            ->view('share', [
                'pet' => $pet,
                'documents' => $documents,
                'weightPath' => $this->weightSvgPath($pet),
                // Trend over the FULL history (the eager-loaded relation is capped
                // at 12 for the sparkline/list); a separate unbounded query keeps
                // this consistent with the app's full-history insight.
                'weightInsight' => WeightInsight::for($pet->weightLogs()->get(), $pet->weight_unit ?: 'kg', $locale),
                'expiresAt' => $expiresAt,
            ])
            // Medical data behind a capability URL — keep crawlers away.
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    /**
     * Points for a simple inline SVG polyline of the weight history
     * (oldest → newest across a 280×72 viewbox), or null if under 2 logs.
     */
    private function weightSvgPath(Pet $pet): ?string
    {
        $logs = $pet->weightLogs->reverse()->values();
        if ($logs->count() < 2) {
            return null;
        }

        $weights = $logs->pluck('weight');
        $min = (float) $weights->min();
        $max = (float) $weights->max();
        $span = max($max - $min, 0.1);

        return $logs->map(function ($log, $i) use ($logs, $min, $span) {
            $x = round($i / ($logs->count() - 1) * 280, 1);
            $y = round(64 - (((float) $log->weight - $min) / $span) * 56 + 4, 1);

            return "{$x},{$y}";
        })->implode(' ');
    }
}
