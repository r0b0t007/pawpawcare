<?php

namespace App\Http\Controllers;

use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->toApi());
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|min:1|max:100',
            'bio' => 'sometimes|nullable|string',
            'avatar_url' => 'sometimes|nullable|string',
            'timezone' => 'sometimes|nullable|string|max:64',
        ]);

        $user = $request->user();

        // Mirror the previous backend: only apply provided, non-null fields.
        foreach (['name', 'bio', 'avatar_url'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $user->{$field} = $data[$field];
            }
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

        return response()->json($user->toApi());
    }
}
