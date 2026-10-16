<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Services\Analytics\ProductAnalytics;
use App\Support\PublicPageLocale;
use Carbon\CarbonInterface;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\App;

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

        // The export speaks the account's saved language (users.locale), the
        // one its emails and pushes use: SetLocale applied it after JwtAuth.

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
                abort(404, __('Pet not found'));
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

        $body = $data['format'] === 'csv'
            ? $this->buildCsv($user->name, $bundle)
            : $this->buildPdf($user->name, $bundle);

        // Only once the file was actually built.
        $analytics->capture($user, 'server_records_exported', [
            'format' => $data['format'],
            'scope' => empty($data['pets']) ? 'all' : 'selected',
            'pet_count' => $pets->count(),
        ]);

        if ($data['format'] === 'csv') {
            return response($body, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            ]);
        }

        return response($body, 200, [
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

        // Headers and section titles follow the locale; dates stay ISO and
        // stored ids (type, status, frequency, category) stay as stored, so
        // the file reads the same into a spreadsheet in every language.
        // What the user typed is never translated.
        $t = fn (string $key, array $replace = []) => __('export.csv.'.$key, $replace);
        $col = fn (string ...$keys) => array_map(fn ($key) => __('export.csv.col.'.$key), $keys);
        // trans(): a group-file key (lang/{locale}/export.php), not a JSON string key.
        $yesNo = fn ($value) => $value ? trans('export.yes') : trans('export.no');

        $row([$t('title')]);
        $row([$t('owner'), $ownerName]);
        $row([$t('exported'), now()->format('Y-m-d')]);

        foreach ($bundle as $entry) {
            $pet = $entry['pet'];

            $row([]);
            $row([$t('pet', ['name' => $pet->name])]);

            $row([$t('profile')]);
            $row($col('name', 'type', 'breed', 'gender', 'birthday', 'age', 'weight', 'microchipped'));
            $row([
                $pet->name,
                $pet->type,
                $pet->breed,
                $pet->gender,
                $pet->birthday?->format('Y-m-d'),
                $pet->age,
                $pet->weight !== null ? $pet->weight.' '.$pet->weight_unit : null,
                $yesNo($pet->microchipped),
            ]);

            $row([]);
            $row([$t('vaccinations')]);
            $row($col('name', 'status', 'due_date', 'administered', 'notes'));
            foreach ($entry['vaccinations'] as $v) {
                $row([$v->name, $v->status, $v->due_date?->format('Y-m-d'), $v->administered_date?->format('Y-m-d'), $v->notes]);
            }

            $row([]);
            $row([$t('medications')]);
            $row($col('name', 'dosage', 'frequency', 'times', 'start', 'end', 'active', 'notes'));
            foreach ($entry['medications'] as $m) {
                $row([
                    $m->name, $m->dosage, $m->frequency,
                    implode(' ', is_array($m->times) ? $m->times : []),
                    $m->start_date?->format('Y-m-d'), $m->end_date?->format('Y-m-d'),
                    $yesNo($m->active), $m->notes,
                ]);
            }

            $row([]);
            $row([$t('appointments')]);
            $row($col('title', 'clinic', 'scheduled_at', 'status', 'notes'));
            foreach ($entry['appointments'] as $a) {
                $row([$a->title, $a->clinic?->name, $a->scheduled_at?->format('Y-m-d H:i'), $a->status, $a->notes]);
            }

            $row([]);
            $row([$t('clinics')]);
            $row($col('name', 'vet', 'phone', 'email', 'address', 'notes'));
            foreach ($entry['clinics'] as $c) {
                $row([$c->name, $c->vet_name, $c->phone, $c->email, $c->address, $c->notes]);
            }

            $row([]);
            $row([$t('weights')]);
            $row($col('date', 'weight', 'unit', 'notes'));
            foreach ($entry['weights'] as $w) {
                $row([$w->logged_at?->format('Y-m-d'), $w->weight, $w->unit, $w->notes]);
            }

            $row([]);
            $row([$t('documents')]);
            $row($col('title', 'category', 'added_on'));
            foreach ($entry['documents'] as $d) {
                $row([$d->title, $d->category, $d->created_at?->format('Y-m-d')]);
            }
        }

        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        // Excel opens a CSV without a byte-order mark as the ANSI code page,
        // which garbles every accented header ("PropriÃ©taire"). The French
        // and Spanish headers always have some, so those files carry the
        // UTF-8 BOM; English keeps the exact bytes it always had.
        return App::getLocale() === 'en' ? $csv : "\u{FEFF}".$csv;
    }

    // ── PDF ────────────────────────────────────────────────────────────────

    private function buildPdf(string $ownerName, Collection $bundle): string
    {
        $locale = App::getLocale();

        $html = view('export', [
            'ownerName' => $ownerName,
            'bundle' => $bundle,
            'locale' => $locale,
            'exportedOn' => self::formatDate(now(), 'date_long'),
            // A date in the export language ('date' or 'datetime' pattern);
            // null stays null so the view's '—' fallbacks keep working.
            'date' => fn (?CarbonInterface $value, string $pattern = 'date') => $value
                ? self::formatDate($value, $pattern)
                : null,
            // The display word for a stored id (pet type, status...) in the
            // export language; ids without one, and every id in English,
            // print as stored.
            'label' => fn (string $group, ?string $value) => self::label($group, $value),
            // A stored decimal (12.5) with the export language's decimal mark;
            // English keeps the '.' it always printed.
            'decimal' => fn (mixed $value) => PublicPageLocale::decimal($value),
        ])->render();

        $options = new Options;
        $options->setIsRemoteEnabled(false); // self-contained document, no fetches

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('a4');
        $dompdf->render();

        return $dompdf->output();
    }

    /** A date in the current locale, with that locale's export.formats pattern. */
    private static function formatDate(CarbonInterface $value, string $pattern): string
    {
        return PublicPageLocale::date($value, 'export.formats.'.$pattern);
    }

    /** A stored id's export.values label; anything else prints as stored. */
    private static function label(string $group, ?string $value): ?string
    {
        return PublicPageLocale::lookup('export.values.'.$group, $value) ?? $value;
    }
}
