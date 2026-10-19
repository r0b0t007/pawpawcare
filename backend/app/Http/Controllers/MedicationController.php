<?php

namespace App\Http\Controllers;

use App\Models\Medication;
use App\Models\MedicationLog;
use App\Models\Pet;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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

        $med = DB::transaction(function () use ($data, $petId) {
            Pet::lockForRecordWrites($petId);
            if (Medication::makesReminders($data['active'] ?? true, $data['frequency'] ?? 'daily')
                && Medication::withRemindersCount($petId) >= Medication::MAX_ACTIVE_PER_PET) {
                Medication::abortAtLimit();
            }

            return Medication::create(array_merge($this->normalize($data), ['pet_id' => $petId]));
        });
        ReminderScheduler::syncMedicationReminder($med);

        return response()->json($med->toApi(), 201);
    }

    public function update(Request $request, string $petId, string $medicationId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $med = $this->medicationOr404($medicationId, $petId);

        $data = $this->validatePayload($request, partial: true);

        $med = DB::transaction(function () use ($data, $medicationId, $petId) {
            Pet::lockForRecordWrites($petId);
            // Re-read under the lock: it may have changed, or been deleted, meanwhile.
            $med = $this->medicationOr404($medicationId, $petId);
            // Switching one back on, or from "as needed" to a schedule, makes
            // reminders again, so it counts towards the limit.
            $before = Medication::makesReminders($med->active, $med->frequency);
            $after = Medication::makesReminders($data['active'] ?? $med->active, $data['frequency'] ?? $med->frequency);
            if (! $before && $after && Medication::withRemindersCount($petId) >= Medication::MAX_ACTIVE_PER_PET) {
                Medication::abortAtLimit();
            }
            $med->fill($this->normalize($data));
            $med->save();

            return $med;
        });

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
            'administered_at' => 'sometimes|nullable|date|before_or_equal:now',
            'notes' => 'sometimes|nullable|string|max:2000',
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
            'times' => 'sometimes|array|max:'.Medication::MAX_DOSE_TIMES,
            'times.*' => 'distinct|date_format:H:i',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string|max:2000',
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
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, __('Pet not found'));
        }

        return $pet;
    }

    private function medicationOr404(string $medicationId, string $petId): Medication
    {
        $med = Medication::where('id', $medicationId)->where('pet_id', $petId)->first();
        if (! $med) {
            abort(404, __('Medication not found'));
        }

        return $med;
    }
}
