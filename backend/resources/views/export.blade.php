<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PawPawCare — Health records</title>
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
    <h1>PawPawCare health records</h1>
    <p class="meta">Prepared for {{ $ownerName }} &middot; Exported {{ $exportedOn }}</p>
    <p class="promise">Complete history — nothing trimmed, nothing behind a plan.</p>

    @forelse ($bundle as $entry)
        @php($pet = $entry['pet'])
        <div class="pet">
            <div class="pet-header">
                <p class="pet-name">{{ $pet->name }}</p>
                <p class="pet-sub">
                    {{ ucfirst($pet->type ?? 'pet') }}@if($pet->breed) &middot; {{ $pet->breed }}@endif
                    @if($pet->gender) &middot; {{ ucfirst($pet->gender) }}@endif
                    @if($pet->birthday) &middot; Born {{ $pet->birthday->format('M j, Y') }}@endif
                    @if($pet->weight !== null) &middot; {{ $pet->weight }} {{ $pet->weight_unit }}@endif
                    &middot; Microchipped: {{ $pet->microchipped ? 'yes' : 'no' }}
                </p>
            </div>

            <h3>Vaccinations</h3>
            @if ($entry['vaccinations']->isEmpty())
                <p class="empty">No vaccinations recorded.</p>
            @else
                <table>
                    <tr><th>Vaccine</th><th>Status</th><th>Due</th><th>Administered</th><th>Notes</th></tr>
                    @foreach ($entry['vaccinations'] as $v)
                        <tr>
                            <td>{{ $v->name }}</td>
                            <td>{{ $v->status }}</td>
                            <td>{{ $v->due_date?->format('M j, Y') }}</td>
                            <td>{{ $v->administered_date?->format('M j, Y') ?? '—' }}</td>
                            <td>{{ $v->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>Medications</h3>
            @if ($entry['medications']->isEmpty())
                <p class="empty">No medications recorded.</p>
            @else
                <table>
                    <tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Times</th><th>Start</th><th>End</th><th>Active</th></tr>
                    @foreach ($entry['medications'] as $m)
                        <tr>
                            <td>{{ $m->name }}</td>
                            <td>{{ $m->dosage ?? '—' }}</td>
                            <td>{{ $m->frequency }}</td>
                            <td>{{ implode(', ', is_array($m->times) ? $m->times : []) ?: '—' }}</td>
                            <td>{{ $m->start_date?->format('M j, Y') ?? '—' }}</td>
                            <td>{{ $m->end_date?->format('M j, Y') ?? '—' }}</td>
                            <td>{{ $m->active ? 'yes' : 'no' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>Appointments</h3>
            @if ($entry['appointments']->isEmpty())
                <p class="empty">No appointments recorded.</p>
            @else
                <table>
                    <tr><th>Visit</th><th>Clinic</th><th>When</th><th>Status</th><th>Notes</th></tr>
                    @foreach ($entry['appointments'] as $a)
                        <tr>
                            <td>{{ $a->title }}</td>
                            <td>{{ $a->clinic?->name ?? '—' }}</td>
                            <td>{{ $a->scheduled_at?->format('M j, Y H:i') }}</td>
                            <td>{{ $a->status }}</td>
                            <td>{{ $a->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>Clinics</h3>
            @if ($entry['clinics']->isEmpty())
                <p class="empty">No clinics saved.</p>
            @else
                <table>
                    <tr><th>Clinic</th><th>Vet</th><th>Phone</th><th>Email</th><th>Address</th></tr>
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

            <h3>Weight history</h3>
            @if ($entry['weights']->isEmpty())
                <p class="empty">No weight entries recorded.</p>
            @else
                <table>
                    <tr><th>Date</th><th>Weight</th><th>Notes</th></tr>
                    @foreach ($entry['weights'] as $w)
                        <tr>
                            <td>{{ $w->logged_at?->format('M j, Y') }}</td>
                            <td>{{ $w->weight }} {{ $w->unit }}</td>
                            <td>{{ $w->notes ?? '—' }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif

            <h3>Documents on file</h3>
            @if ($entry['documents']->isEmpty())
                <p class="empty">No documents in the vault.</p>
            @else
                <table>
                    <tr><th>Document</th><th>Category</th><th>Added on</th></tr>
                    @foreach ($entry['documents'] as $d)
                        <tr>
                            <td>{{ $d->title }}</td>
                            <td>{{ $d->category }}</td>
                            <td>{{ $d->created_at?->format('M j, Y') }}</td>
                        </tr>
                    @endforeach
                </table>
            @endif
        </div>
    @empty
        <p class="empty">No pets to export yet.</p>
    @endforelse

    <div class="footer">
        Generated by PawPawCare &middot; pawpawcare.app &middot; Your records belong to you — export everything free, anytime.
    </div>
</body>
</html>
