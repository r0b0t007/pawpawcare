<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Pet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function index(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            Appointment::with('clinic')
                ->where('pet_id', $petId)
                ->orderByDesc('scheduled_at')
                ->get()
                ->map->toApi()
        );
    }

    public function store(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $this->validatePayload($request);
        $this->assertClinicBelongs($data['clinic_id'] ?? null, $petId);

        $appt = Appointment::create(array_merge($data, ['pet_id' => $petId]));

        return response()->json($appt->load('clinic')->toApi(), 201);
    }

    public function update(Request $request, string $petId, string $appointmentId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $appt = $this->appointmentOr404($appointmentId, $petId);

        $data = $this->validatePayload($request, partial: true);
        if (array_key_exists('clinic_id', $data)) {
            $this->assertClinicBelongs($data['clinic_id'], $petId);
        }

        $appt->fill($data);
        $appt->save();

        return response()->json($appt->load('clinic')->toApi());
    }

    public function destroy(Request $request, string $petId, string $appointmentId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $this->appointmentOr404($appointmentId, $petId)->delete();

        return response()->json(null, 204);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'title' => "{$req}|string|min:1|max:150",
            'scheduled_at' => "{$req}|date",
            'clinic_id' => 'sometimes|nullable|string',
            'status' => 'sometimes|in:scheduled,completed,cancelled',
            'notes' => 'sometimes|nullable|string|max:2000',
        ]);
    }

    /** A linked clinic must belong to the same pet (or be cleared). */
    private function assertClinicBelongs(?string $clinicId, string $petId): void
    {
        if ($clinicId && ! Clinic::where('id', $clinicId)->where('pet_id', $petId)->exists()) {
            abort(422, 'Clinic not found for this pet');
        }
    }

    private function appointmentOr404(string $appointmentId, string $petId): Appointment
    {
        $appt = Appointment::where('id', $appointmentId)->where('pet_id', $petId)->first();
        if (! $appt) {
            abort(404, 'Appointment not found');
        }

        return $appt;
    }

    private function petOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }
}
