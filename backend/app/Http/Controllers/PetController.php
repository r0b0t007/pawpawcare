<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Expense;
use App\Models\FavoriteFood;
use App\Models\Pet;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\ReminderScheduler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PetController extends Controller
{
    // ── Pets CRUD ──────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $pets = Pet::accessibleBy($request->user()->id)->get();

        return response()->json($pets->map->toApi());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|min:1|max:100',
            'type' => 'sometimes|string|max:50',
            'breed' => 'sometimes|nullable|string|max:100',
            'age' => 'sometimes|nullable|numeric',
            'birthday' => 'sometimes|nullable|date',
            'weight' => 'sometimes|nullable|numeric',
            'weight_unit' => 'sometimes|string|max:5',
            'gender' => 'sometimes|nullable|string|max:20',
            'microchipped' => 'sometimes|boolean',
            'color' => 'sometimes|nullable|string|max:30',
            'avatar_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https?://|/(?!/))#i'],
            'heart_rate' => 'sometimes|nullable|integer',
            'activity_level' => 'sometimes|nullable|string|max:30',
        ]);

        $pet = Pet::create(array_merge($data, ['owner_id' => $request->user()->id]));

        // Seed the weight history so the tracker and the profile agree from day one.
        $this->recordCurrentWeightLog($pet);

        return response()->json($pet->toApi(), 201);
    }

    public function show(Request $request, string $petId): JsonResponse
    {
        return response()->json($this->petOr404($request, $petId)->toApi());
    }

    public function update(Request $request, string $petId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $data = $request->validate([
            'name' => 'sometimes|string|min:1|max:100',
            'type' => 'sometimes|nullable|string|max:50',
            'breed' => 'sometimes|nullable|string|max:100',
            'age' => 'sometimes|nullable|numeric',
            'birthday' => 'sometimes|nullable|date',
            'weight' => 'sometimes|nullable|numeric',
            'weight_unit' => 'sometimes|nullable|string|max:5',
            'gender' => 'sometimes|nullable|string|max:20',
            'microchipped' => 'sometimes|nullable|boolean',
            'color' => 'sometimes|nullable|string|max:30',
            'avatar_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'regex:#^(https?://|/(?!/))#i'],
            'heart_rate' => 'sometimes|nullable|integer',
            'activity_level' => 'sometimes|nullable|string|max:30',
        ]);

        $oldWeight = $pet->weight;

        // Mirror the previous backend: only apply provided, non-null fields.
        foreach ($data as $field => $value) {
            if ($value !== null) {
                $pet->{$field} = $value;
            }
        }
        $pet->save();

        // A weight change from the edit form flows into the history too, so the
        // profile pill and the weight tracker never disagree.
        if (array_key_exists('weight', $data) && $data['weight'] !== null
            && (float) $data['weight'] !== (float) $oldWeight) {
            $this->recordCurrentWeightLog($pet);
        }

        return response()->json($pet->toApi());
    }

    public function destroy(Request $request, string $petId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        // Deleting a pet is destructive and owner-only; co-owners can only `leave`.
        if ($pet->owner_id !== $request->user()->id) {
            abort(403, 'Only the owner can delete this pet');
        }
        $pet->delete();

        return response()->json(null, 204);
    }

    // ── Vaccinations ───────────────────────────────────────────────────────

    public function listVaccinations(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $vaccinations = Vaccination::where('pet_id', $petId)->get();
        $today = Carbon::today();

        foreach ($vaccinations as $vax) {
            if ($vax->status === 'upcoming' && $vax->due_date->lt($today)) {
                $vax->status = 'overdue';
                $vax->save();
            }
        }

        return response()->json($vaccinations->map->toApi());
    }

    public function addVaccination(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'name' => 'required|string|min:1|max:150',
            'due_date' => 'required|date',
            'notes' => 'sometimes|nullable|string|max:2000',
        ]);

        $vax = Vaccination::create(array_merge($data, ['pet_id' => $petId]));

        // Auto-create a reminder (default: 7 days before due date at 09:00 local).
        ReminderScheduler::syncVaccinationReminder($vax);

        return response()->json($vax->toApi(), 201);
    }

    public function completeVaccination(Request $request, string $petId, string $vaxId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'administered_date' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string|max:2000',
        ]);

        $vax = Vaccination::where('id', $vaxId)->where('pet_id', $petId)->first();
        if (! $vax) {
            abort(404, 'Vaccination not found');
        }

        $vax->status = 'completed';
        $vax->administered_date = $data['administered_date'] ?? Carbon::today()->format('Y-m-d');
        if (! empty($data['notes'])) {
            $vax->notes = $data['notes'];
        }
        $vax->save();

        // Once administered, the due-date reminder is no longer needed.
        ReminderScheduler::cancelVaccinationReminder($vax);

        return response()->json($vax->toApi());
    }

    public function deleteVaccination(Request $request, string $petId, string $vaxId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $vax = Vaccination::where('id', $vaxId)->where('pet_id', $petId)->first();
        if (! $vax) {
            abort(404, 'Vaccination not found');
        }
        ReminderScheduler::cancelVaccinationReminder($vax);
        $vax->delete();

        return response()->json(null, 204);
    }

    // ── Activities ─────────────────────────────────────────────────────────

    public function listActivities(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            Activity::where('pet_id', $petId)->get()->map->toApi()
        );
    }

    public function addActivity(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'name' => 'required|string|min:1|max:150',
            'duration' => 'sometimes|nullable|string|max:50',
            'time_of_day' => 'sometimes|nullable|string|max:20',
            'icon' => 'sometimes|nullable|string|max:50',
        ]);

        $activity = Activity::create(array_merge($data, ['pet_id' => $petId]));

        return response()->json($activity->toApi(), 201);
    }

    public function deleteActivity(Request $request, string $petId, string $activityId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $activity = Activity::where('id', $activityId)->where('pet_id', $petId)->first();
        if (! $activity) {
            abort(404, 'Activity not found');
        }
        $activity->delete();

        return response()->json(null, 204);
    }

    // ── Favorite foods ─────────────────────────────────────────────────────

    public function listFoods(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            FavoriteFood::where('pet_id', $petId)->get()->map->toApi()
        );
    }

    public function addFood(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'name' => 'required|string|min:1|max:100',
        ]);

        $food = FavoriteFood::create(array_merge($data, ['pet_id' => $petId]));

        return response()->json($food->toApi(), 201);
    }

    public function deleteFood(Request $request, string $petId, string $foodId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $food = FavoriteFood::where('id', $foodId)->where('pet_id', $petId)->first();
        if (! $food) {
            abort(404, 'Food not found');
        }
        $food->delete();

        return response()->json(null, 204);
    }

    // ── Weight history ─────────────────────────────────────────────────────

    public function listWeights(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            WeightLog::where('pet_id', $petId)
                ->orderBy('logged_at')
                ->orderBy('created_at')
                ->get()
                ->map->toApi()
        );
    }

    public function addWeight(Request $request, string $petId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $data = $request->validate([
            'weight' => 'required|numeric|min:0|max:1000',
            'logged_at' => 'sometimes|nullable|date|before_or_equal:today',
            'notes' => 'sometimes|nullable|string|max:200',
        ]);

        $log = WeightLog::create([
            'pet_id' => $pet->id,
            'weight' => $data['weight'],
            // A pet's logs are always in the pet's unit, so the history can't mix kg/lbs.
            'unit' => $pet->weight_unit ?: 'kg',
            'logged_at' => $data['logged_at'] ?? Carbon::today()->format('Y-m-d'),
            'notes' => $data['notes'] ?? null,
        ]);

        $this->syncCurrentWeight($pet);

        return response()->json($log->toApi(), 201);
    }

    public function deleteWeight(Request $request, string $petId, string $weightId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $log = WeightLog::where('id', $weightId)->where('pet_id', $petId)->first();
        if (! $log) {
            abort(404, 'Weight entry not found');
        }
        $log->delete();

        $this->syncCurrentWeight($pet);

        return response()->json(null, 204);
    }

    /** Record (or update) today's weight log to match the pet's current weight. */
    private function recordCurrentWeightLog(Pet $pet): void
    {
        if ($pet->weight === null) {
            return;
        }

        WeightLog::updateOrCreate(
            ['pet_id' => $pet->id, 'logged_at' => Carbon::today()->format('Y-m-d')],
            ['weight' => $pet->weight, 'unit' => $pet->weight_unit ?: 'kg'],
        );
    }

    /** Keep pet.weight in sync with the most recent logged entry. */
    private function syncCurrentWeight(Pet $pet): void
    {
        $latest = WeightLog::where('pet_id', $pet->id)
            ->orderByDesc('logged_at')
            ->orderByDesc('created_at')
            ->first();

        if ($latest) {
            $pet->weight = $latest->weight;
            $pet->weight_unit = $latest->unit;
            $pet->save();
        }
    }

    // ── Expenses ───────────────────────────────────────────────────────────

    public function listExpenses(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            Expense::where('pet_id', $petId)
                ->orderByDesc('incurred_on')
                ->orderByDesc('created_at')
                ->get()
                ->map->toApi()
        );
    }

    public function addExpense(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'category' => 'sometimes|in:vet,food,grooming,medication,supplies,insurance,other',
            'amount' => 'required|numeric|min:0|max:1000000',
            'incurred_on' => 'sometimes|nullable|date|before_or_equal:today',
            'notes' => 'sometimes|nullable|string|max:200',
        ]);

        $expense = Expense::create([
            'pet_id' => $petId,
            'category' => $data['category'] ?? 'other',
            'amount' => $data['amount'],
            'incurred_on' => $data['incurred_on'] ?? Carbon::today()->format('Y-m-d'),
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json($expense->toApi(), 201);
    }

    public function deleteExpense(Request $request, string $petId, string $expenseId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $expense = Expense::where('id', $expenseId)->where('pet_id', $petId)->first();
        if (! $expense) {
            abort(404, 'Expense not found');
        }
        $expense->delete();

        return response()->json(null, 204);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function petOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::accessibleBy($request->user()->id)
            ->where('id', $petId)
            ->first();

        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }
}
