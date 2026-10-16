@php($L = \App\Support\PublicPageLocale::class)
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{ __('share.title', ['name' => $pet->name]) }}</title>
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
  .trend { display:flex; align-items:center; gap:8px; padding:14px 16px 4px; }
  .trend-arrow { font-size:13px; }
  .trend-up { color:var(--amber); } .trend-down { color:var(--green); } .trend-stable { color:var(--sub); }
  .trend-text { font-weight:600; }
  .trend-flag { padding:0 16px 12px; color:var(--amber); font-size:13px; }
  .empty { padding:14px 16px; color:var(--sub); }
  a.doc { color:var(--accent); text-decoration:none; font-weight:600; }
  .langs { display:flex; justify-content:flex-end; gap:12px; margin:0 4px 10px; font-size:13px; }
  .langs a { color:var(--sub); text-decoration:none; }
  .langs a[aria-current] { color:var(--ink); font-weight:600; }
  .foot { margin-top:32px; text-align:center; color:var(--sub); font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">

  <nav class="langs" aria-label="{{ __('share.language') }}">{{-- display language only: hl is unsigned and never changes the data shown --}}
    @foreach ($L::switchLinks(request()) as $code => $href)
      <a href="{{ $href }}" lang="{{ $code }}" hreflang="{{ $code }}"@if ($code === app()->getLocale()) aria-current="true"@endif>{{ $L::NAMES[$code] }}</a>
    @endforeach
  </nav>

  <div class="hero">
    <h1>{{ $pet->name }}</h1>
    <div class="meta">
      {{ $L::label('types', $pet->type, ucfirst($pet->type)) }}{{ $pet->breed ? ' · '.$pet->breed : '' }}{{ $pet->gender ? ' · '.$L::label('genders', $pet->gender, ucfirst($pet->gender)) : '' }}
    </div>
    <div class="facts">
      @if ($pet->age !== null)<span class="fact"><b>{{ __('share.age') }}</b> {{ trans_choice('share.age_value', round($pet->age, 1), ['age' => $L::decimal(rtrim(rtrim(number_format($pet->age, 1), '0'), '.'))]) }}</span>@endif
      @if ($pet->birthday)<span class="fact"><b>{{ __('share.born') }}</b> {{ $L::date($pet->birthday, 'share.date_format') }}</span>@endif
      @if ($pet->weight)<span class="fact"><b>{{ __('share.weight') }}</b> {{ $L::decimal($pet->weight) }} {{ $pet->weight_unit }}</span>@endif
      <span class="fact"><b>{{ __('share.microchipped') }}</b> {{ $pet->microchipped ? __('share.yes') : __('share.no') }}</span>
    </div>
  </div>

  <h2>{{ __('share.vaccinations') }}</h2>
  <div class="card">
    @forelse ($pet->vaccinations as $vax)
      <div class="row">
        <div>
          <div class="name">{{ $vax->name }}</div>
          @if ($vax->administered_date)<div class="sub">{{ __('share.given', ['date' => $L::date($vax->administered_date, 'share.date_format')]) }}</div>@endif
        </div>
        <div class="right">
          @if ($vax->status === 'completed')
            <span class="badge done">{{ __('share.completed') }}</span>
          @else
            <span class="badge due">{{ __('share.due', ['date' => $L::date($vax->due_date, 'share.date_format')]) }}</span>
          @endif
        </div>
      </div>
    @empty
      <div class="empty">{{ __('share.no_vaccinations') }}</div>
    @endforelse
  </div>

  <h2>{{ __('share.medications') }}</h2>
  <div class="card">
    @forelse ($pet->medications as $med)
      <div class="row">
        <div>
          <div class="name">{{ $med->name }}</div>
          <div class="sub">
            {{ collect([$med->dosage, $L::label('frequencies', $med->frequency, str_replace('_', ' ', (string) $med->frequency))])->filter()->implode(' · ') }}
          </div>
        </div>
        @if ($med->start_date)
          <div class="right sub">{{ __('share.since', ['date' => $L::date($med->start_date, 'share.date_format')]) }}</div>
        @endif
      </div>
    @empty
      <div class="empty">{{ __('share.no_medications') }}</div>
    @endforelse
  </div>

  <h2>{{ __('share.weight') }}</h2>
  <div class="card">
    @if ($weightInsight)
      <div class="trend">
        <span class="trend-arrow trend-{{ $weightInsight['direction'] }}">
          {{ ['up' => '▲', 'down' => '▼', 'stable' => '▬'][$weightInsight['direction']] }}
        </span>
        <span class="trend-text">{{ $weightInsight['summary'] }}</span>
      </div>
      @if ($weightInsight['notable'])
        <div class="trend-flag">{{ __('share.notable') }}</div>
      @endif
    @endif
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
        <div class="name">{{ $L::decimal($log->weight) }} {{ $log->unit }}</div>
        <div class="right sub">{{ $L::date($log->logged_at, 'share.date_format') }}</div>
      </div>
    @empty
      <div class="empty">{{ __('share.no_weight') }}</div>
    @endforelse
  </div>

  @if ($pet->clinics->isNotEmpty())
    <h2>{{ __('share.clinics') }}</h2>
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
    <h2>{{ __('share.documents') }}</h2>
    <div class="card">
      @foreach ($documents as $doc)
        <div class="row">
          <div>
            <a class="doc" href="{{ $doc['url'] }}" target="_blank" rel="noopener">{{ $doc['title'] }}</a>
            <div class="sub">{{ $L::label('categories', $doc['category'], ucfirst($doc['category'])) }}</div>
          </div>
          <div class="right sub">{{ $L::date($doc['created_at'], 'share.date_format') }}</div>
        </div>
      @endforeach
    </div>
  @endif

  <div class="foot">
    {{ __('share.footer', ['expires' => $L::expiry($expiresAt, 'share.expires_format')]) }}
  </div>

</div>
</body>
</html>
