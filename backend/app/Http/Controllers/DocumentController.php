<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Document;
use App\Models\Expense;
use App\Models\Medication;
use App\Models\Pet;
use App\Models\Vaccination;
use App\Models\WeightLog;
use App\Services\Analytics\ProductAnalytics;
use App\Services\DocumentExtractor;
use App\Services\ReminderScheduler;
use App\Support\Uploads;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
        // Stored on the PRIVATE disk — never web-accessible without a signed URL.
        $path = $isPdf
            ? Uploads::storePrivatePdf($file, 'documents')
            : Uploads::storePrivateImage($file, 'documents');

        $doc = Document::create([
            'pet_id' => $petId,
            'appointment_id' => $data['appointment_id'] ?? null,
            'clinic_id' => $data['clinic_id'] ?? null,
            'title' => $data['title'],
            'category' => $data['category'] ?? 'other',
            'file_path' => $path,
            'mime' => $isPdf ? 'application/pdf' : $file->getMimeType(),
            // Record the actual stored size (images are re-encoded, so it differs).
            'size_bytes' => Storage::disk(Uploads::PRIVATE_DISK)->size($path),
        ]);

        return response()->json($doc->toApi(), 201);
    }

    /**
     * Mint a short-lived signed URL for viewing a document. Requires access to the
     * pet (this route is JWT-guarded); the returned URL authorizes the actual file
     * fetch via its signature + expiry, so it works in a browser / external viewer.
     */
    public function url(Request $request, string $petId, string $documentId): JsonResponse
    {
        $this->petOr404($request, $petId);

        $doc = Document::where('id', $documentId)->where('pet_id', $petId)->first();
        if (! $doc) {
            abort(404, 'Document not found');
        }

        $url = URL::temporarySignedRoute('documents.raw', now()->addMinutes(5), ['document' => $doc->id]);

        return response()->json(['url' => $url]);
    }

    /**
     * Stream the file behind a valid signed URL. This route is NOT JWT-guarded
     * (a browser can't send the token) — the signature, minted only for an
     * authorized user and valid for minutes, is the authorization.
     */
    public function raw(string $documentId): StreamedResponse
    {
        $doc = Document::find($documentId);
        $disk = Storage::disk(Uploads::PRIVATE_DISK);
        if (! $doc || ! $disk->exists($doc->file_path)) {
            abort(404, 'Document not found');
        }

        return $disk->response($doc->file_path, $doc->title, [
            'Content-Type' => $doc->mime ?: 'application/octet-stream',
        ]);
    }

    /**
     * AI document intake: read the file with Claude and store structured
     * suggestions on the document. Nothing is written to real records here —
     * the user reviews and applies via a separate endpoint. Idempotent: a
     * completed extraction is returned as-is rather than re-running (and
     * re-paying for) the API call.
     */
    public function extract(Request $request, string $petId, string $documentId, DocumentExtractor $extractor, ProductAnalytics $analytics): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $doc = Document::where('id', $documentId)->where('pet_id', $petId)->first();
        if (! $doc) {
            abort(404, 'Document not found');
        }

        if ($doc->extraction_status === 'done' && $doc->extraction) {
            return response()->json($doc->toApi());
        }
        if ($doc->extraction_status === 'pending') {
            abort(409, 'Extraction already in progress');
        }
        // Capability gate before any tokens are spent — e.g. OpenAI-compatible
        // providers read images but not PDFs (no rasterization step).
        if (! $extractor->supports($doc)) {
            abort(422, 'The configured AI provider cannot read this document type.');
        }

        // Columns are guarded (not fillable) — set explicitly, never from input.
        $doc->forceFill(['extraction_status' => 'pending'])->save();

        $startedAt = hrtime(true);
        $track = fn (string $status) => $analytics->capture($request->user(), 'server_document_extracted', [
            'status' => $status,
            'provider' => (string) config('services.extraction.provider'),
            'mime_family' => match (true) {
                str_starts_with((string) $doc->mime, 'image/') => 'image',
                $doc->mime === 'application/pdf' => 'pdf',
                default => 'other',
            },
            'duration_ms' => intdiv(hrtime(true) - $startedAt, 1_000_000),
        ]);

        try {
            $extraction = $extractor->extract($doc, $pet);
        } catch (\Throwable $e) {
            Log::warning('Document extraction failed', ['document_id' => $doc->id, 'error' => $e->getMessage()]);
            $doc->forceFill(['extraction_status' => 'failed'])->save();
            $track('failed');
            abort(502, 'Could not read the document. Please try again.');
        }

        $doc->forceFill([
            'extraction_status' => 'done',
            'extraction' => $extraction,
            'extracted_at' => now(),
        ])->save();
        $track('done');

        return response()->json($doc->toApi());
    }

    /**
     * Apply a reviewed extraction: create real records from the user's
     * edited, approved subset of the suggestions. Idempotent — re-applying
     * skips anything that already exists (see the per-group dedup rules) —
     * and atomic. `pet_id` always comes from the verified route, never the
     * payload.
     */
    public function applyExtraction(Request $request, string $petId, string $documentId): JsonResponse
    {
        $pet = $this->petOr404($request, $petId);

        $doc = Document::where('id', $documentId)->where('pet_id', $petId)->first();
        if (! $doc) {
            abort(404, 'Document not found');
        }
        if ($doc->extraction_status !== 'done') {
            abort(409, 'Extract the document before applying');
        }

        $data = $request->validate([
            'vaccinations' => 'sometimes|array',
            'vaccinations.*.name' => 'required|string|min:1|max:150',
            'vaccinations.*.administered_date' => 'sometimes|nullable|date',
            'vaccinations.*.due_date' => 'sometimes|nullable|date',
            'vaccinations.*.notes' => 'sometimes|nullable|string|max:500',
            'medications' => 'sometimes|array',
            'medications.*.name' => 'required|string|min:1|max:150',
            'medications.*.dosage' => 'sometimes|nullable|string|max:100',
            'medications.*.frequency' => 'sometimes|nullable|in:daily,weekly,monthly,as_needed',
            'medications.*.start_date' => 'sometimes|nullable|date',
            'medications.*.end_date' => 'sometimes|nullable|date',
            'medications.*.notes' => 'sometimes|nullable|string|max:500',
            'weight' => 'sometimes|nullable|array',
            'weight.value' => 'required_with:weight|numeric|min:0.01|max:1000',
            'weight.unit' => 'sometimes|in:kg,lb',
            'weight.date' => 'sometimes|nullable|date|before_or_equal:today',
            'expense' => 'sometimes|nullable|array',
            'expense.amount' => 'required_with:expense|numeric|min:0.01|max:1000000',
            'expense.date' => 'sometimes|nullable|date|before_or_equal:today',
            'expense.notes' => 'sometimes|nullable|string|max:200',
            'clinic' => 'sometimes|nullable|array',
            'clinic.name' => 'required_with:clinic|string|min:1|max:150',
            'clinic.phone' => 'sometimes|nullable|string|max:50',
            'clinic.address' => 'sometimes|nullable|string|max:255',
            'set_title' => 'sometimes|boolean',
            'set_category' => 'sometimes|boolean',
        ]);

        $result = DB::transaction(function () use ($data, $doc, $pet, $petId) {
            $applied = [
                'vaccinations' => [], 'medications' => [],
                'weight' => null, 'expense' => null, 'clinic' => null,
                'skipped' => [],
            ];

            // Clinic first, so the document link lands in the same pass.
            if (! empty($data['clinic']['name'])) {
                $clinic = Clinic::firstOrCreate(
                    ['pet_id' => $petId, 'name' => $data['clinic']['name']],
                    ['phone' => $data['clinic']['phone'] ?? null, 'address' => $data['clinic']['address'] ?? null],
                );
                $doc->clinic_id = $clinic->id;
                $applied['clinic'] = $clinic->toApi();
            }

            foreach ($data['vaccinations'] ?? [] as $v) {
                $administered = $v['administered_date'] ?? null;
                // The schema requires a due_date; an administered-only record
                // (no next due on the document) reuses the administered date.
                $due = $v['due_date'] ?? $administered;
                if (! $due) {
                    $applied['skipped'][] = ['type' => 'vaccination', 'name' => $v['name'], 'reason' => 'no date'];

                    continue;
                }

                $base = Vaccination::where('pet_id', $petId)->where('name', $v['name']);
                $dupe = $administered
                    ? (clone $base)->whereDate('administered_date', $administered)->exists()
                    : (clone $base)->whereDate('due_date', $due)->exists();
                if ($dupe) {
                    $applied['skipped'][] = ['type' => 'vaccination', 'name' => $v['name'], 'reason' => 'already exists'];

                    continue;
                }

                $vax = Vaccination::create([
                    'pet_id' => $petId,
                    'name' => $v['name'],
                    'due_date' => $due,
                    'status' => $administered ? 'completed' : 'upcoming',
                    'administered_date' => $administered,
                    'notes' => $v['notes'] ?? null,
                ]);
                // Documents often state the NEXT due date ("next due 2027-05-12")
                // — remind for it. Past-due completed records get no reminder,
                // matching completeVaccination's cancel-on-complete semantics.
                if (Carbon::parse($due)->isFuture()) {
                    ReminderScheduler::syncVaccinationReminder($vax);
                }
                $applied['vaccinations'][] = $vax->toApi();
            }

            foreach ($data['medications'] ?? [] as $m) {
                if (Medication::where('pet_id', $petId)->where('name', $m['name'])->where('active', true)->exists()) {
                    $applied['skipped'][] = ['type' => 'medication', 'name' => $m['name'], 'reason' => 'already exists'];

                    continue;
                }

                $med = Medication::create([
                    'pet_id' => $petId,
                    'name' => $m['name'],
                    'dosage' => $m['dosage'] ?? null,
                    'frequency' => $m['frequency'] ?? 'daily',
                    'times' => ['09:00'], // same default as MedicationController::normalize
                    'start_date' => $m['start_date'] ?? null,
                    'end_date' => $m['end_date'] ?? null,
                    'notes' => $m['notes'] ?? null,
                ]);
                ReminderScheduler::syncMedicationReminder($med);
                $applied['medications'][] = $med->toApi();
            }

            if (! empty($data['weight']['value'])) {
                // History stays in the pet's unit (see PetController::addWeight),
                // so convert when the document used the other one.
                $unit = $data['weight']['unit'] ?? 'kg';
                $petUnit = $pet->weight_unit ?: 'kg';
                $value = round((float) $data['weight']['value'] * match (true) {
                    $unit === $petUnit => 1.0,
                    $unit === 'lb' => 0.453592,
                    default => 2.20462,
                }, 2);
                $date = $data['weight']['date'] ?? Carbon::today()->format('Y-m-d');

                $dupe = WeightLog::where('pet_id', $petId)->whereBetween('logged_at', [
                    Carbon::parse($date)->subDay()->format('Y-m-d'),
                    Carbon::parse($date)->addDay()->format('Y-m-d'),
                ])->exists();
                if ($dupe) {
                    $applied['skipped'][] = ['type' => 'weight', 'reason' => 'an entry within a day already exists'];
                } else {
                    $log = WeightLog::create([
                        'pet_id' => $petId,
                        'weight' => $value,
                        'unit' => $petUnit,
                        'logged_at' => $date,
                        'notes' => 'From document: '.$doc->title,
                    ]);
                    $this->syncCurrentWeight($pet);
                    $applied['weight'] = $log->toApi();
                }
            }

            if (! empty($data['expense']['amount'])) {
                $amount = round((float) $data['expense']['amount'], 2);
                $date = $data['expense']['date'] ?? Carbon::today()->format('Y-m-d');

                if (Expense::where('pet_id', $petId)->where('amount', $amount)->whereDate('incurred_on', $date)->exists()) {
                    $applied['skipped'][] = ['type' => 'expense', 'reason' => 'already exists'];
                } else {
                    $expense = Expense::create([
                        'pet_id' => $petId,
                        'category' => 'vet',
                        'amount' => $amount,
                        'incurred_on' => $date,
                        'notes' => $data['expense']['notes'] ?? 'From document: '.$doc->title,
                    ]);
                    $applied['expense'] = $expense->toApi();
                }
            }

            // Optionally adopt the suggested title/category from the stored
            // extraction (values come from what the model read, not the payload).
            $extraction = $doc->extraction ?? [];
            if (($data['set_title'] ?? false) && ! empty($extraction['suggested_title'])) {
                $doc->title = $extraction['suggested_title'];
            }
            if (($data['set_category'] ?? false) && ! empty($extraction['document_type'])) {
                $doc->category = $extraction['document_type'];
            }
            $extraction['_applied_at'] = now()->toISOString();
            $doc->forceFill(['extraction' => $extraction])->save();
            $applied['document'] = $doc->toApi();

            return $applied;
        });

        return response()->json($result);
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

    /** Mirrors PetController::syncCurrentWeight — keep the pet's headline weight on the latest log. */
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

    private function petOr404(Request $request, string $petId): Pet
    {
        $pet = Pet::accessibleBy($request->user()->id)->where('id', $petId)->first();
        if (! $pet) {
            abort(404, 'Pet not found');
        }

        return $pet;
    }
}
