<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Document;
use App\Models\Pet;
use App\Support\Uploads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DocumentController extends Controller
{
    public function index(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        return response()->json(
            Document::where('pet_id', $petId)
                ->orderByDesc('created_at')
                ->get()
                ->map->toApi()
        );
    }

    /**
     * Upload a record file (PDF or image) together with its metadata in one
     * multipart request, so there's no orphan window between upload and save.
     */
    public function store(Request $request, string $petId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $data = $request->validate([
            'file' => 'required|file|mimes:pdf,jpg,jpeg,png,webp|max:10240', // 10 MB
            'title' => 'required|string|min:1|max:150',
            'category' => 'sometimes|in:lab,vaccination,prescription,invoice,imaging,insurance,other',
            'appointment_id' => 'sometimes|nullable|string',
            'clinic_id' => 'sometimes|nullable|string',
        ]);

        // Linked appointment/clinic, if given, must belong to the same pet.
        if (! empty($data['appointment_id'])
            && ! Appointment::where('id', $data['appointment_id'])->where('pet_id', $petId)->exists()) {
            abort(422, 'Appointment not found for this pet');
        }
        if (! empty($data['clinic_id'])
            && ! Clinic::where('id', $data['clinic_id'])->where('pet_id', $petId)->exists()) {
            abort(422, 'Clinic not found for this pet');
        }

        $file = $request->file('file');
        $isPdf = $file->getMimeType() === 'application/pdf';
        $url = $isPdf
            ? Uploads::storePdf($file, 'documents')
            : Uploads::storeImage($file, 'documents');

        $doc = Document::create([
            'pet_id' => $petId,
            'appointment_id' => $data['appointment_id'] ?? null,
            'clinic_id' => $data['clinic_id'] ?? null,
            'title' => $data['title'],
            'category' => $data['category'] ?? 'other',
            'file_url' => $url,
            'mime' => $isPdf ? 'application/pdf' : $file->getMimeType(),
            'size_bytes' => $file->getSize(),
        ]);

        return response()->json($doc->toApi(), 201);
    }

    public function destroy(Request $request, string $petId, string $documentId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $doc = Document::where('id', $documentId)->where('pet_id', $petId)->first();
        if (! $doc) {
            abort(404, 'Document not found');
        }
        $doc->delete(); // model hook removes the stored file

        return response()->json(null, 204);
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
