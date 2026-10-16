<?php

namespace App\Http\Controllers;

use App\Models\CareProfile;
use App\Models\Pet;
use App\Services\Analytics\ProductAnalytics;
use App\Services\Subscriptions\Entitlements;
use App\Support\PublicPageLocale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * Caretaker mode: owner-authored handoff notes (feeding, instructions,
 * emergency contact) plus a time-limited, read-only web page a pet sitter
 * opens in any browser — no account.
 *
 * Same signed-URL trust model as the vet share page, with an independent
 * `care_token` so caretaker and vet links revoke separately. The page is
 * read-only (the sitter can't edit records), matching a sitter handoff.
 */
class CareController extends Controller
{
    // Sitting runs longer than a vet visit — offer day/week-scale expiries.
    private const EXPIRIES = ['1d' => 1440, '3d' => 4320, '7d' => 10080, '14d' => 20160];

    /** Read the pet's care profile (owner or co-owner). Empty shell if unset. */
    public function show(Request $request, string $petId): JsonResponse
    {
        $pet = $this->accessiblePetOr404($request, $petId);

        $profile = $pet->careProfile;

        return response()->json($profile ? $profile->toApi() : [
            'pet_id' => $pet->id,
            'feeding' => null,
            'instructions' => null,
            'emergency_name' => null,
            'emergency_phone' => null,
            'updated_at' => null,
        ]);
    }

    /** Create or update the care profile (owner or co-owner). */
    public function update(Request $request, string $petId): JsonResponse
    {
        $pet = $this->accessiblePetOr404($request, $petId);

        $data = $request->validate([
            'feeding' => 'sometimes|nullable|string|max:2000',
            'instructions' => 'sometimes|nullable|string|max:2000',
            'emergency_name' => 'sometimes|nullable|string|max:150',
            'emergency_phone' => 'sometimes|nullable|string|max:50',
        ]);

        $profile = CareProfile::updateOrCreate(['pet_id' => $pet->id], $data);

        return response()->json($profile->toApi());
    }

    /** Mint a caretaker link (owner or co-owner). */
    public function createLink(Request $request, string $petId, ProductAnalytics $analytics, Entitlements $entitlements): JsonResponse
    {
        $pet = $this->accessiblePetOr404($request, $petId);
        // Plan gate (inert unless PAYWALL_ENABLED + GATE_CARE_LINKS).
        $entitlements->authorize($request->user(), 'care_links', $pet);

        $data = $request->validate([
            'expires_in' => 'sometimes|in:1d,3d,7d,14d',
        ]);

        if (! $pet->care_token) {
            $pet->forceFill(['care_token' => Str::random(40)])->save();
        }

        $expiresIn = $data['expires_in'] ?? '7d';
        $expiresAt = now()->addMinutes(self::EXPIRIES[$expiresIn]);
        // Signed-in creator's language, inside the signature (none for English).
        $url = URL::temporarySignedRoute('pets.care', $expiresAt, [
            'pet' => $pet->id,
            't' => $pet->care_token,
        ] + PublicPageLocale::linkParams());

        $analytics->capture($request->user(), 'server_care_link_created', ['expires_in' => $expiresIn]);

        return response()->json(['url' => $url, 'expires_at' => $expiresAt->toISOString()]);
    }

    /** Revoke every outstanding caretaker link by rotating the token. */
    public function revokeLink(Request $request, string $petId): JsonResponse
    {
        $pet = $this->accessiblePetOr404($request, $petId);

        $pet->forceFill(['care_token' => Str::random(40)])->save();

        return response()->json(null, 204);
    }

    /**
     * Render the read-only caretaker page behind a valid signature. NOT
     * JWT-guarded — the signature (minted only by a user with pet access) plus
     * the matching care_token is the authorization.
     */
    public function page(Request $request, string $petId)
    {
        $pet = Pet::with([
            'careProfile',
            'medications' => fn ($q) => $q->where('active', true)->orderBy('name'),
            'clinics' => fn ($q) => $q->orderBy('name'),
        ])->find($petId);

        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        // Valid signature, but a rotated token means the link was revoked.
        if (! $pet->care_token || ! hash_equals($pet->care_token, (string) $request->query('t'))) {
            abort(410, __('This caretaker link has been revoked.'));
        }

        // The page takes the link's signed `lang` (English when absent or
        // unsupported); the 404/410 above keep the browser language.
        PublicPageLocale::apply($request);

        return response()
            ->view('care', [
                'pet' => $pet,
                'profile' => $pet->careProfile,
                'expiresAt' => Carbon::createFromTimestamp((int) $request->query('expires')),
            ])
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    private function accessiblePetOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        return $pet;
    }
}
