<?php

namespace Tests\Feature;

use App\Models\LostPetReport;
use App\Models\Pet;
use App\Models\PetInvite;
use App\Models\Reminder;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Support\Facades\Hash;

/**
 * Account pre-hijack setup (security audit round 2): whoever holds an
 * account whose email was never verified shares its pet with an accomplice,
 * leaves an invite pending, mints share and caretaker links, and has a
 * lost-pet report filed with the accomplice's phone.
 */
trait PlantsDelegatedAccess
{
    /** @return array{pet: Pet, accomplice: User, accompliceToken: string, invite: PetInvite, report: LostPetReport} */
    private function plantAccess(User $holder): array
    {
        $pet = Pet::create(['owner_id' => $holder->id, 'name' => 'Luna', 'weight_unit' => 'kg']);
        $accomplice = User::create([
            'name' => 'Accomplice', 'email' => 'accomplice'.uniqid().'@example.com',
            'hashed_password' => Hash::make('secret123'), 'timezone' => 'UTC',
        ]);
        $accomplice->forceFill(['email_verified_at' => now()])->save();
        $pet->members()->attach($accomplice->id, ['role' => 'member', 'created_at' => now()]);
        Reminder::create([
            'user_id' => $accomplice->id, 'pet_id' => $pet->id, 'type' => 'custom', 'title' => 'T', 'body' => 'B',
            'schedule_type' => 'one_time',
        ]);
        $invite = PetInvite::create([
            'pet_id' => $pet->id, 'invited_by' => $holder->id, 'email' => 'second@example.com', 'status' => 'pending',
        ]);
        $pet->forceFill(['share_token' => str_repeat('s', 40), 'care_token' => str_repeat('c', 40)])->save();
        // Finders of the "lost" pet would call the accomplice.
        $report = LostPetReport::create([
            'pet_id' => $pet->id, 'reported_by' => $accomplice->id, 'status' => 'active', 'contact_phone' => '+15550100',
        ]);

        return [
            'pet' => $pet,
            'accomplice' => $accomplice,
            'accompliceToken' => JwtService::createAccessToken($accomplice->id),
            'invite' => $invite,
            'report' => $report,
        ];
    }

    /** @param  array{pet: Pet, accomplice: User, accompliceToken: string, invite: PetInvite, report: LostPetReport}  $planted */
    private function assertAccessRevoked(array $planted): void
    {
        $pet = $planted['pet']->fresh();
        $this->assertSame(0, $pet->members()->count());
        $this->withToken($planted['accompliceToken'])->getJson("/pets/{$pet->id}")->assertNotFound();
        $this->assertSame(0, Reminder::where('user_id', $planted['accomplice']->id)->count());
        $this->assertNull(PetInvite::find($planted['invite']->id));
        $this->assertNull($pet->share_token);
        $this->assertNull($pet->care_token);
        $report = $planted['report']->fresh();
        $this->assertSame($pet->owner_id, $report->reported_by);
        $this->assertNull($report->contact_phone);
    }

    /** @param  array{pet: Pet, accomplice: User, accompliceToken: string, invite: PetInvite, report: LostPetReport}  $planted */
    private function assertAccessKept(array $planted): void
    {
        $pet = $planted['pet']->fresh();
        $this->assertSame(1, $pet->members()->count());
        $this->withToken($planted['accompliceToken'])->getJson("/pets/{$pet->id}")->assertOk();
        $this->assertNotNull(PetInvite::find($planted['invite']->id));
        $this->assertSame(str_repeat('s', 40), $pet->share_token);
        $this->assertSame(str_repeat('c', 40), $pet->care_token);
        $this->assertSame('+15550100', $planted['report']->fresh()->contact_phone);
    }
}
