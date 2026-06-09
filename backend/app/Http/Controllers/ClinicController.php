<?php

namespace App\Http\Controllers;

use App\Models\Clinic;
use App\Models\Pet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicController extends Controller
{
    public function index(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            Clinic::where('pet_id', $petId)->orderBy('name')->get()->map->toApi()
        );
    }

    public function store(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $this->validatePayload($request);
        $clinic = Clinic::create(array_merge($data, ['pet_id' => $petId]));

        return response()->json($clinic->toApi(), 201);
    }

    public function update(Request $request, string $petId, string $clinicId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $clinic = $this->clinicOr404($clinicId, $petId);

        $clinic->fill($this->validatePayload($request, partial: true));
        $clinic->save();

        return response()->json($clinic->toApi());
    }

    public function destroy(Request $request, string $petId, string $clinicId): JsonResponse
    {
        $this->petOr404($request, $petId);
        $this->clinicOr404($clinicId, $petId)->delete();

        return response()->json(null, 204);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "{$req}|string|min:1|max:150",
            'vet_name' => 'sometimes|nullable|string|max:150',
            'phone' => 'sometimes|nullable|string|max:40',
            'email' => 'sometimes|nullable|email|max:255',
            'address' => 'sometimes|nullable|string|max:255',
            'notes' => 'sometimes|nullable|string',
        ]);
    }

    private function clinicOr404(string $clinicId, string $petId): Clinic
    {
        $clinic = Clinic::where('id', $clinicId)->where('pet_id', $petId)->first();
        if (! $clinic) {
            abort(404, 'Clinic not found');
        }

        return $clinic;
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
