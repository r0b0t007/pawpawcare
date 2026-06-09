<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\User;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PetSharingController extends Controller
{
    // ── Owner-side: manage who a pet is shared with ─────────────────────────

    /** List the owner, co-owners, and pending invites for a pet (any member). */
    public function members(Request $request, string $petId): JsonResponse
    {
        $pet = $this->accessiblePetOr404($request, $petId);
        $pet->load(['owner', 'members', 'invites' => fn ($q) => $q->where('status', 'pending')]);

        return response()->json($this->shareState($pet, $request->user()->id));
    }

    /** Invite someone to co-own a pet, by email (owner only). */
    public function invite(Request $request, string $petId): JsonResponse
    {
        $pet = $this->ownedPetOr404($request, $petId);

        $data = $request->validate([
            'email' => 'required|email|max:255',
        ]);
        $email = strtolower(trim($data['email']));

        // Can't invite yourself.
        if ($email === strtolower($pet->owner->email ?? $request->user()->email)) {
            abort(422, 'You already own this pet');
        }

        // Already a co-owner? Nothing to do.
        $alreadyMember = $pet->members()
            ->whereRaw('LOWER(users.email) = ?', [$email])
            ->exists();
        if ($alreadyMember) {
            abort(422, 'That person already has access to this pet');
        }

        // Reuse an existing pending invite so a double-tap can't create duplicates.
        $invite = PetInvite::firstOrCreate(
            ['pet_id' => $pet->id, 'email' => $email, 'status' => 'pending'],
            ['invited_by' => $request->user()->id],
        );
        $invite->load(['pet', 'inviter']);

        return response()->json($invite->toApi(), $invite->wasRecentlyCreated ? 201 : 200);
    }

    /** Remove a co-owner from a pet (owner only). */
    public function removeMember(Request $request, string $petId, string $userId): JsonResponse
    {
        $pet = $this->ownedPetOr404($request, $petId);

        $member = $pet->members()->where('users.id', $userId)->first();
        if (! $member) {
            abort(404, 'Member not found');
        }
        $pet->members()->detach($userId);
        ReminderScheduler::purgeForMember($pet, $member);

        return response()->json(null, 204);
    }

    /** Cancel a still-pending invite (owner only). */
    public function cancelInvite(Request $request, string $petId, string $inviteId): JsonResponse
    {
        $pet = $this->ownedPetOr404($request, $petId);

        $invite = PetInvite::where('id', $inviteId)
            ->where('pet_id', $pet->id)
            ->where('status', 'pending')
            ->first();
        if (! $invite) {
            abort(404, 'Invite not found');
        }
        $invite->delete();

        return response()->json(null, 204);
    }

    /** A co-owner removes themselves from a pet they were shared into. */
    public function leave(Request $request, string $petId): JsonResponse
    {
        $user = $request->user();
        $pet = Pet::where('id', $petId)->first();
        if (! $pet || ! $pet->members()->where('users.id', $user->id)->exists()) {
            abort(404, 'Pet not found');
        }
        $pet->members()->detach($user->id);
        ReminderScheduler::purgeForMember($pet, $user);

        return response()->json(null, 204);
    }

    // ── Invitee-side: respond to invitations addressed to me ────────────────

    /** Pending invitations addressed to the current user's email. */
    public function listInvites(Request $request): JsonResponse
    {
        $invites = PetInvite::with(['pet', 'inviter'])
            ->whereRaw('LOWER(email) = ?', [strtolower($request->user()->email)])
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($invites->map->toApi());
    }

    /** Accept an invitation → become a co-owner of the pet. */
    public function accept(Request $request, string $inviteId): JsonResponse
    {
        $user = $request->user();
        $invite = $this->myPendingInviteOr404($inviteId, $user);

        $invite->status = 'accepted';
        $invite->save();

        // Idempotent: re-accepting (or owning) won't create a duplicate row.
        $pet = Pet::find($invite->pet_id);
        if ($pet && $pet->owner_id !== $user->id) {
            $pet->members()->syncWithoutDetaching([
                $user->id => ['role' => 'member', 'created_at' => now()],
            ]);
            // Give the new co-owner their own copy of the pet's care reminders.
            ReminderScheduler::backfillForMember($pet, $user);
        }

        return response()->json($pet ? $pet->toApi() : null);
    }

    /** Decline an invitation. */
    public function decline(Request $request, string $inviteId): JsonResponse
    {
        $invite = $this->myPendingInviteOr404($inviteId, $request->user());
        $invite->status = 'declined';
        $invite->save();

        return response()->json(null, 204);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private function shareState(Pet $pet, string $viewerId): array
    {
        return [
            'pet_id' => $pet->id,
            'owner' => $pet->owner ? array_merge($pet->owner->toApi(), ['role' => 'owner']) : null,
            'is_owner' => $pet->owner_id === $viewerId,
            'members' => $pet->members->map(fn (User $m) => array_merge($m->toApi(), [
                'role' => $m->pivot->role,
                'joined_at' => $m->pivot->created_at ? (string) $m->pivot->created_at : null,
            ]))->values(),
            'invites' => $pet->invites->map->toApi()->values(),
        ];
    }

    private function accessiblePetOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }

    private function ownedPetOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::where('id', $petId)->where('owner_id', $request->user()->id)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }

    private function myPendingInviteOr404(string $inviteId, User $user): PetInvite
    {
        $invite = PetInvite::where('id', $inviteId)
            ->whereRaw('LOWER(email) = ?', [strtolower($user->email)])
            ->where('status', 'pending')
            ->first();
        if (! $invite) {
            abort(404, 'Invite not found');
        }

        return $invite;
    }
}
