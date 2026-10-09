<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Services\Analytics\ProductAnalytics;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;

/**
 * Health-records export center. Every record a user (or their co-owned pets)
 * has ever created leaves the app as a single CSV or PDF — free, uncapped,
 * full history. "Your data is never locked behind a plan" is the whole point.
 */
class ExportController extends Controller
{
    public function export(Request $request, ProductAnalytics $analytics): Response
    {
        $data = $request->validate([
            'format' => 'required|in:pdf,csv',
            'pets' => 'sometimes|nullable|string',
        ]);

        $user = $request->user();

        // Same scoping as every pet route: own pets + pets shared with me.
        // An id outside that set 404s exactly like a nonexistent one, so the
        // endpoint can't be used to probe other users' pet ids.
        $query = Pet::accessibleBy($user->id);
        if (! empty($data['pets'])) {
            $ids = collect(explode(',', $data['pets']))
                ->map(fn ($id) => trim($id))
                ->filter()
                ->unique()
                ->values();
            $pets = $query->whereIn('id', $ids)->orderBy('name')->get();
            if ($pets->count() !== $ids->count()) {
                abort(404, 'Pet not found');
            }
        } else {
            $pets = $query->orderBy('name')->get();
        }

        $bundle = $pets->map(fn (Pet $pet) => [
            'pet' => $pet,
            'vaccinations' => $pet->vaccinations()->orderBy('due_date')->get(),
            'medications' => $pet->medications()->orderBy('name')->get(),
            'appointments' => $pet->appointments()->with('clinic')->orderBy('scheduled_at')->get(),
            'clinics' => $pet->clinics()->orderBy('name')->get(),
            'weights' => $pet->weightLogs()->orderBy('logged_at')->orderBy('created_at')->get(),
            // Index only (names/dates) — the files themselves stay in the vault.
            'documents' => $pet->documents()->orderByDesc('created_at')->get(),
        ]);

        $filename = 'pawpawcare-records-'.now()->format('Y-m-d').'.'.$data['format'];

        $analytics->capture($user, 'server_records_exported', [
            'format' => $data['format'],
            'scope' => empty($data['pets']) ? 'all' : 'selected',
            'pet_count' => $pets->count(),
        ]);

        if ($data['format'] === 'csv') {
            return response($this->buildCsv($user->name, $bundle), 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            ]);
        }

        return response($this->buildPdf($user->name, $bundle), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    // ── CSV ────────────────────────────────────────────────────────────────

    private function buildCsv(string $ownerName, Collection $bundle): string
    {
        $out = fopen('php://temp', 'r+');
        $row = function (array $cells) use ($out) {
            // Neutralize spreadsheet formula injection: a co-owner could plant
            // "=HYPERLINK(...)" in a shared pet's notes and it would execute
            // when this export is opened in Excel/Sheets. A leading apostrophe
            // makes such cells render as plain text.
            $safe = array_map(function ($cell) {
                if (is_string($cell) && $cell !== ''
                    && in_array($cell[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
                    return "'".$cell;
                }

                return $cell;
            }, $cells);

            fputcsv($out, $safe, escape: '\\');
        };

        $row(['PawPawCare — Health records export']);
        $row(['Owner', $ownerName]);
        $row(['Exported', now()->format('Y-m-d')]);

        foreach ($bundle as $entry) {
            $pet = $entry['pet'];

            $row([]);
            $row(['=== PET: '.$pet->name.' ===']);

            $row(['PROFILE']);
            $row(['Name', 'Type', 'Breed', 'Gender', 'Birthday', 'Age', 'Weight', 'Microchipped']);
            $row([
                $pet->name,
                $pet->type,
                $pet->breed,
                $pet->gender,
                $pet->birthday?->format('Y-m-d'),
                $pet->age,
                $pet->weight !== null ? $pet->weight.' '.$pet->weight_unit : null,
                $pet->microchipped ? 'yes' : 'no',
            ]);

            $row([]);
            $row(['VACCINATIONS']);
            $row(['Name', 'Status', 'Due date', 'Administered', 'Notes']);
            foreach ($entry['vaccinations'] as $v) {
                $row([$v->name, $v->status, $v->due_date?->format('Y-m-d'), $v->administered_date?->format('Y-m-d'), $v->notes]);
            }

            $row([]);
            $row(['MEDICATIONS']);
            $row(['Name', 'Dosage', 'Frequency', 'Times', 'Start', 'End', 'Active', 'Notes']);
            foreach ($entry['medications'] as $m) {
                $row([
                    $m->name, $m->dosage, $m->frequency,
                    implode(' ', is_array($m->times) ? $m->times : []),
                    $m->start_date?->format('Y-m-d'), $m->end_date?->format('Y-m-d'),
                    $m->active ? 'yes' : 'no', $m->notes,
                ]);
            }

            $row([]);
            $row(['APPOINTMENTS']);
            $row(['Title', 'Clinic', 'Scheduled at', 'Status', 'Notes']);
            foreach ($entry['appointments'] as $a) {
                $row([$a->title, $a->clinic?->name, $a->scheduled_at?->format('Y-m-d H:i'), $a->status, $a->notes]);
            }

            $row([]);
            $row(['CLINICS']);
            $row(['Name', 'Vet', 'Phone', 'Email', 'Address', 'Notes']);
            foreach ($entry['clinics'] as $c) {
                $row([$c->name, $c->vet_name, $c->phone, $c->email, $c->address, $c->notes]);
            }

            $row([]);
            $row(['WEIGHT HISTORY']);
            $row(['Date', 'Weight', 'Unit', 'Notes']);
            foreach ($entry['weights'] as $w) {
                $row([$w->logged_at?->format('Y-m-d'), $w->weight, $w->unit, $w->notes]);
            }

            $row([]);
            $row(['DOCUMENTS (index — files stay in your vault)']);
            $row(['Title', 'Category', 'Added on']);
            foreach ($entry['documents'] as $d) {
                $row([$d->title, $d->category, $d->created_at?->format('Y-m-d')]);
            }
        }

        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    // ── PDF ────────────────────────────────────────────────────────────────

    private function buildPdf(string $ownerName, Collection $bundle): string
    {
        $html = view('export', [
            'ownerName' => $ownerName,
            'bundle' => $bundle,
            'exportedOn' => now()->format('F j, Y'),
        ])->render();

        $options = new Options;
        $options->setIsRemoteEnabled(false); // self-contained document, no fetches

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('a4');
        $dompdf->render();

        return $dompdf->output();
    }
}
