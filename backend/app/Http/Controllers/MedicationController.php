<?php

namespace App\Http\Controllers;

use App\Models\Medication;
use App\Models\MedicationLog;
use App\Models\Pet;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MedicationController extends Controller
{
    public function index(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $meds = Medication::where('pet_id', $petId)
            ->withMax('logs', 'administered_at')
            ->orderByDesc('active')
            ->orderBy('name')
            ->get();

        return response()->json($meds->map->toApi());
    }

    public function store(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $this->validatePayload($request);

        $med = Medication::create(array_merge($this->normalize($data), ['pet_id' => $petId]));
        ReminderScheduler::syncMedicationReminder($med);

        return response()->json($med->toApi(), 201);
    }

    public function update(Request $request, string $petId, string $medicationId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $med = $this->medicationOr404($medicationId, $petId);

        $data = $this->validatePayload($request, partial: true);
        $med->fill($this->normalize($data));
        $med->save();

        ReminderScheduler::syncMedicationReminder($med);

        return response()->json($med->fresh()->toApi());
    }

    public function destroy(Request $request, string $petId, string $medicationId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $med = $this->medicationOr404($medicationId, $petId);

        ReminderScheduler::cancelMedicationReminder($med);
        $med->delete();

        return response()->json(null, 204);
    }

    public function logDose(Request $request, string $petId, string $medicationId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $med = $this->medicationOr404($medicationId, $petId);

        $data = $request->validate([
            'administered_at' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string',
        ]);

        $log = MedicationLog::create([
            'medication_id' => $med->id,
            'administered_at' => ! empty($data['administered_at']) ? Carbon::parse($data['administered_at']) : now(),
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json($log->toApi(), 201);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "{$req}|string|min:1|max:150",
            'dosage' => 'sometimes|nullable|string|max:100',
            'frequency' => 'sometimes|in:daily,weekly,monthly,as_needed',
            'times' => 'sometimes|array',
            'times.*' => 'date_format:H:i',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string',
            'active' => 'sometimes|boolean',
        ]);
    }

    /** Drop nulls (so PATCH only touches provided fields) and default times. */
    private function normalize(array $data): array
    {
        $clean = array_filter($data, fn ($v) => $v !== null);

        if (array_key_exists('times', $clean) && empty($clean['times'])) {
            $clean['times'] = ['09:00'];
        }

        return $clean;
    }

    private function petOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::where('id', $petId)->where('owner_id', $request->user()->id)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }

    private function medicationOr404(string $medicationId, string $petId): Medication
    {
        $med = Medication::where('id', $medicationId)->where('pet_id', $petId)->first();
        if (! $med) {
            abort(404, 'Medication not found');
        }

        return $med;
    }
}
