<!DOCTYPE html>
<html lang="{{ $locale }}">
<head>
<meta charset="utf-8">
<title>{{ __('export.pdf.document_title') }}</title>
<style>
    /* Dompdf-safe styling: tables + block layout only, no flexbox/grid. */
    body { font-family: DejaVu Sans, sans-serif; font-size: 10.5px; color: #241a0e; margin: 28px 34px; }
    h1 { font-size: 19px; margin: 0 0 2px; color: #8a5300; }
    .meta { color: #7a6f60; margin: 0 0 6px; }
    .promise { color: #7a6f60; font-style: italic; margin: 0 0 18px; }
    .pet { margin-top: 22px; page-break-inside: avoid; }
    .pet-header { background: #f7efe3; border: 1px solid #e8dcc8; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
    .pet-name { font-size: 15px; font-weight: bold; margin: 0; }
    .pet-sub { color: #7a6f60; margin: 2px 0 0; }
    h3 { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #8a5300; margin: 14px 0 5px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; color: #7a6f60; border-bottom: 1px solid #e8dcc8; padding: 4px 8px 4px 0; }
    td { border-bottom: 1px solid #f1ead9; padding: 5px 8px 5px 0; vertical-align: top; }
    .empty { color: #a89b88; font-style: italic; }
    .footer { margin-top: 26px; padding-top: 8px; border-top: 1px solid #e8dcc8; color: #a89b88; font-size: 9px; }
</style>
</head>
<body>
    <h1>{{ __('export.pdf.heading') }}</h1>
    <p class="meta">{{ __('export.pdf.prepared_for', ['name' => $ownerName]) }} &middot; {{ __('export.pdf.exported_on', ['date' => $exportedOn]) }}</p>
    <p class="promise">{{ __('export.pdf.promise') }}</p>

    @forelse ($bundle as $entry)
        @php($pet = $entry['pet'])
        <div class="pet">
            <div class="pet-header">
                <p class="pet-name">{{ $pet->name }}</p>
                <p class="pet-sub">
                    {{ ucfirst($label('pet_type', $pet->type) ?? __('export.pdf.pet_fallback')) }}@if($pet->breed) &middot; {{ $pet->breed }}@endif
                    @if($pet->gender) &middot; {{ ucfirst($label('gender', $pet->gender)) }}@endif
                    @if($pet->birthday) &middot; {{ __('export.pdf.born', ['date' => $date($pet->birthday)]) }}@endif
                    @if($pet->weight !== null) &middot; {{ $pet->weight }} {{ $pet->weight_unit }}@endif
                    &middot; {{ __('export.pdf.microchipped', ['answer' => $pet->microchipped ? __('export.yes') : __('export.no')]) }}
                </p>
            </div>

            <h3>{{ __('export.pdf.vaccinations') }}</h3>
            @if ($entry['vaccinations']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_vaccinations') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.vaccine') }}</th><th>{{ __('export.pdf.col.status') }}</th><th>{{ __('export.pdf.col.due') }}</th><th>{{ __('export.pdf.col.administered') }}</th><th>{{ __('export.pdf.col.notes') }}</th></tr>
                    @foreach ($entry['vaccinations'] as $v)
                        <tr>
                            <td>{{ $v->name }}</td>
                            <td>{{ $label('vaccination_status', $v->status) }}</td>
                            <td>{{ $date($v->due_date) }}</td>
                            <td>{{ $date($v->administered_date) ?? '—' }}</td>
                            <td>{{ $v->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>{{ __('export.pdf.medications') }}</h3>
            @if ($entry['medications']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_medications') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.medication') }}</th><th>{{ __('export.pdf.col.dosage') }}</th><th>{{ __('export.pdf.col.frequency') }}</th><th>{{ __('export.pdf.col.times') }}</th><th>{{ __('export.pdf.col.start') }}</th><th>{{ __('export.pdf.col.end') }}</th><th>{{ __('export.pdf.col.active') }}</th></tr>
                    @foreach ($entry['medications'] as $m)
                        <tr>
                            <td>{{ $m->name }}</td>
                            <td>{{ $m->dosage ?? '—' }}</td>
                            <td>{{ $label('frequency', $m->frequency) }}</td>
                            <td>{{ implode(', ', is_array($m->times) ? $m->times : []) ?: '—' }}</td>
                            <td>{{ $date($m->start_date) ?? '—' }}</td>
                            <td>{{ $date($m->end_date) ?? '—' }}</td>
                            <td>{{ $m->active ? __('export.yes') : __('export.no') }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>{{ __('export.pdf.appointments') }}</h3>
            @if ($entry['appointments']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_appointments') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.visit') }}</th><th>{{ __('export.pdf.col.clinic') }}</th><th>{{ __('export.pdf.col.when') }}</th><th>{{ __('export.pdf.col.status') }}</th><th>{{ __('export.pdf.col.notes') }}</th></tr>
                    @foreach ($entry['appointments'] as $a)
                        <tr>
                            <td>{{ $a->title }}</td>
                            <td>{{ $a->clinic?->name ?? '—' }}</td>
                            <td>{{ $date($a->scheduled_at, 'datetime') }}</td>
                            <td>{{ $label('appointment_status', $a->status) }}</td>
                            <td>{{ $a->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>{{ __('export.pdf.clinics') }}</h3>
            @if ($entry['clinics']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_clinics') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.clinic') }}</th><th>{{ __('export.pdf.col.vet') }}</th><th>{{ __('export.pdf.col.phone') }}</th><th>{{ __('export.pdf.col.email') }}</th><th>{{ __('export.pdf.col.address') }}</th></tr>
                    @foreach ($entry['clinics'] as $c)
                        <tr>
                            <td>{{ $c->name }}</td>
                            <td>{{ $c->vet_name ?? '—' }}</td>
                            <td>{{ $c->phone ?? '—' }}</td>
                            <td>{{ $c->email ?? '—' }}</td>
                            <td>{{ $c->address ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>{{ __('export.pdf.weights') }}</h3>
            @if ($entry['weights']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_weights') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.date') }}</th><th>{{ __('export.pdf.col.weight') }}</th><th>{{ __('export.pdf.col.notes') }}</th></tr>
                    @foreach ($entry['weights'] as $w)
                        <tr>
                            <td>{{ $date($w->logged_at) }}</td>
                            <td>{{ $w->weight }} {{ $w->unit }}</td>
                            <td>{{ $w->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>{{ __('export.pdf.documents') }}</h3>
            @if ($entry['documents']->isEmpty())
                <p class="empty">{{ __('export.pdf.no_documents') }}</p>
            @else
                <table>
                    <tr><th>{{ __('export.pdf.col.document') }}</th><th>{{ __('export.pdf.col.category') }}</th><th>{{ __('export.pdf.col.added_on') }}</th></tr>
                    @foreach ($entry['documents'] as $d)
                        <tr>
                            <td>{{ $d->title }}</td>
                            <td>{{ $label('document_category', $d->category) }}</td>
                            <td>{{ $date($d->created_at) }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif
        </div>
    @empty
        <p class="empty">{{ __('export.pdf.no_pets') }}</p>
    @endforelse

    <div class="footer">
        {{ __('export.pdf.footer_generated') }} &middot; pawpawcare.app &middot; {{ __('export.pdf.footer_promise') }}
    </div>
</body>
</html>
