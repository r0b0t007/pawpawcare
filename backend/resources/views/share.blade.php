<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{ $pet->name }} — Medical Summary</title>
<style>
  :root { --ink:#27211b; --sub:#7a7066; --line:#eee7de; --card:#fffdf9; --bg:#f6f1ea;
          --green:#3e7d4f; --green-bg:#e8f3ea; --amber:#a05a00; --amber-bg:#fdf0dd; --accent:#c4663a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width:680px; margin:0 auto; padding:20px 16px 48px; }
  .hero { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; }
  .hero h1 { margin:0; font-size:26px; }
  .hero .meta { color:var(--sub); margin-top:4px; }
  .facts { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
  .fact { background:var(--bg); border-radius:999px; padding:4px 12px; font-size:13px; }
  .fact b { font-weight:600; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--sub);
       margin:26px 4px 8px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .row { display:flex; align-items:baseline; gap:10px; padding:12px 16px; border-top:1px solid var(--line); }
  .row:first-child { border-top:0; }
  .row .name { font-weight:600; }
  .row .sub { color:var(--sub); font-size:13px; }
  .row .right { margin-left:auto; text-align:right; white-space:nowrap; }
  .badge { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:600; }
  .badge.done { background:var(--green-bg); color:var(--green); }
  .badge.due { background:var(--amber-bg); color:var(--amber); }
  .chart { padding:14px 16px 6px; }
  .chart svg { width:100%; height:auto; display:block; }
  .empty { padding:14px 16px; color:var(--sub); }
  a.doc { color:var(--accent); text-decoration:none; font-weight:600; }
  .foot { margin-top:32px; text-align:center; color:var(--sub); font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">

  <div class="hero">
    <h1>{{ $pet->name }}</h1>
    <div class="meta">
      {{ ucfirst($pet->type) }}{{ $pet->breed ? ' · '.$pet->breed : '' }}{{ $pet->gender ? ' · '.ucfirst($pet->gender) : '' }}
    </div>
    <div class="facts">
      @if ($pet->age !== null)<span class="fact"><b>Age</b> {{ rtrim(rtrim(number_format($pet->age, 1), '0'), '.') }} yr</span>@endif
      @if ($pet->birthday)<span class="fact"><b>Born</b> {{ $pet->birthday->format('M j, Y') }}</span>@endif
      @if ($pet->weight)<span class="fact"><b>Weight</b> {{ $pet->weight }} {{ $pet->weight_unit }}</span>@endif
      <span class="fact"><b>Microchipped</b> {{ $pet->microchipped ? 'Yes' : 'No' }}</span>
    </div>
  </div>

  <h2>Vaccinations</h2>
  <div class="card">
    @forelse ($pet->vaccinations as $vax)
      <div class="row">
        <div>
          <div class="name">{{ $vax->name }}</div>
          @if ($vax->administered_date)<div class="sub">Given {{ $vax->administered_date->format('M j, Y') }}</div>@endif
        </div>
        <div class="right">
          @if ($vax->status === 'completed')
            <span class="badge done">Completed</span>
          @else
            <span class="badge due">Due {{ $vax->due_date?->format('M j, Y') }}</span>
          @endif
        </div>
      </div>
    @empty
      <div class="empty">No vaccinations on record.</div>
    @endforelse
  </div>

  <h2>Active medications</h2>
  <div class="card">
    @forelse ($pet->medications as $med)
      <div class="row">
        <div>
          <div class="name">{{ $med->name }}</div>
          <div class="sub">
            {{ collect([$med->dosage, str_replace('_', ' ', $med->frequency)])->filter()->implode(' · ') }}
          </div>
        </div>
        @if ($med->start_date)
          <div class="right sub">since {{ $med->start_date->format('M j, Y') }}</div>
        @endif
      </div>
    @empty
      <div class="empty">No active medications.</div>
    @endforelse
  </div>

  <h2>Weight</h2>
  <div class="card">
    @if ($weightPath)
      <div class="chart">
        <svg viewBox="0 0 280 72" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="{{ $weightPath }}" fill="none" stroke="#c4663a" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    @endif
    @forelse ($pet->weightLogs->take(5) as $log)
      <div class="row">
        <div class="name">{{ $log->weight }} {{ $log->unit }}</div>
        <div class="right sub">{{ $log->logged_at->format('M j, Y') }}</div>
      </div>
    @empty
      <div class="empty">No weight history.</div>
    @endforelse
  </div>

  @if ($pet->clinics->isNotEmpty())
    <h2>Vet clinics</h2>
    <div class="card">
      @foreach ($pet->clinics as $clinic)
        <div class="row">
          <div>
            <div class="name">{{ $clinic->name }}</div>
            <div class="sub">{{ collect([$clinic->vet_name, $clinic->address])->filter()->implode(' · ') }}</div>
          </div>
          @if ($clinic->phone)<div class="right"><a class="doc" href="tel:{{ $clinic->phone }}">{{ $clinic->phone }}</a></div>@endif
        </div>
      @endforeach
    </div>
  @endif

  @if ($documents->isNotEmpty())
    <h2>Recent documents</h2>
    <div class="card">
      @foreach ($documents as $doc)
        <div class="row">
          <div>
            <a class="doc" href="{{ $doc['url'] }}" target="_blank" rel="noopener">{{ $doc['title'] }}</a>
            <div class="sub">{{ ucfirst($doc['category']) }}</div>
          </div>
          <div class="right sub">{{ $doc['created_at']->format('M j, Y') }}</div>
        </div>
      @endforeach
    </div>
  @endif

  <div class="foot">
    Shared via PawPawCare · read-only · link expires {{ $expiresAt->format('M j, Y g:i A T') }}
  </div>

</div>
</body>
</html>
