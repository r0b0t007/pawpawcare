<?php

namespace App\Http\Controllers;

use App\Services\Subscriptions\Entitlements;
use App\Services\Subscriptions\EntitlementSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    /**
     * POST /users/me/subscription/sync — called by the app right after a
     * purchase or restore. Reads the caller's purchases from RevenueCat's API
     * (never from the request) and returns the updated plan.
     */
    public function sync(Request $request, EntitlementSync $sync, Entitlements $entitlements): JsonResponse
    {
        $user = $request->user();

        if (! $sync->configured()) {
            return response()->json(['detail' => 'Subscriptions are not configured'], 503);
        }
        if (! $sync->sync($user)) {
            return response()->json(['detail' => 'Could not reach the subscription service. Please try again.'], 503);
        }

        return response()->json([
            'plan' => $entitlements->snapshot($user),
            'features' => $entitlements->features($user),
        ]);
    }
}
