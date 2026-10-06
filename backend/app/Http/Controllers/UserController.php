<?php

namespace App\Http\Controllers;

use App\Models\RefreshToken;
use App\Models\User;
use App\Services\ReminderScheduler;
use App\Support\Uploads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->toSelfApi());
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|min:1|max:100',
            'bio' => 'sometimes|nullable|string|max:1000',
            'avatar_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https?://|/(?!/))#i'],
            'timezone' => 'sometimes|nullable|string|max:64',
            'engagement_pushes_enabled' => 'sometimes|boolean',
        ]);

        $user = $request->user();

        Uploads::assertUsableUrl($data['avatar_url'] ?? null, [$user->id], $user->avatar_url, 'avatar_url');

        // Mirror the previous backend: only apply provided, non-null fields.
        foreach (['name', 'bio', 'avatar_url'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $user->{$field} = $data[$field];
            }
        }
        // Explicit boolean assignment (null falls through to unchanged).
        if (array_key_exists('engagement_pushes_enabled', $data) && $data['engagement_pushes_enabled'] !== null) {
            $user->engagement_pushes_enabled = (bool) $data['engagement_pushes_enabled'];
        }

        // Timezone is validated against the IANA list before applying.
        $tzChanged = false;
        if (! empty($data['timezone'])
            && in_array($data['timezone'], timezone_identifiers_list(), true)
            && $user->timezone !== $data['timezone']) {
            $user->timezone = $data['timezone'];
            $tzChanged = true;
        }
        $user->save();

        if ($tzChanged) {
            ReminderScheduler::recomputeForUser($user);
        }

        // toSelfApi: PATCH responses replace the client's stored user object,
        // so the is_admin flag must survive a profile edit.
        return response()->json($user->toSelfApi());
    }

    /**
     * Request account deletion (GDPR-style). The account is disabled
     * immediately — JwtAuth rejects every request from a disabled user, and
     * all sessions are revoked here — then permanently purged by the
     * `accounts:purge-deleted` command after the grace period. Logging back
     * in (or completing a password reset) during the grace period cancels it.
     */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->forceFill([
            'is_active' => false,
            'deletion_requested_at' => now(),
        ])->save();

        // Kill every session and stop push notifications right away.
        RefreshToken::where('user_id', $user->id)->delete();
        $user->deviceTokens()->delete();

        return response()->json([
            'status' => 'deletion_scheduled',
            'purge_after' => now()->addDays(User::DELETION_GRACE_DAYS)->toISOString(),
        ]);
    }
}
