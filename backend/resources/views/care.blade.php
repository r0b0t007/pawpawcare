@php($L = \App\Support\PublicPageLocale::class)
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{ __('care.title', ['name' => $pet->name]) }}</title>
<style>
  :root { --ink:#27211b; --sub:#7a7066; --line:#eee7de; --card:#fffdf9; --bg:#f6f1ea;
          --accent:#c4663a; --rose:#b3324c; --rose-bg:#fbe9ec; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width:680px; margin:0 auto; padding:20px 16px 48px; }
  .hero { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; }
  .hero .eyebrow { color:var(--accent); font-size:12px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; }
  .hero h1 { margin:2px 0 0; font-size:26px; }
  .hero .meta { color:var(--sub); margin-top:4px; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--sub); margin:26px 4px 8px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .pad { padding:14px 16px; }
  .pad.prewrap { white-space:pre-wrap; }
  .row { display:flex; align-items:baseline; gap:10px; padding:12px 16px; border-top:1px solid var(--line); }
  .row:first-child { border-top:0; }
  .row .name { font-weight:600; }
  .row .sub { color:var(--sub); font-size:13px; }
  .row .right { margin-left:auto; text-align:right; white-space:nowrap; color:var(--sub); font-size:13px; }
  .empty { padding:14px 16px; color:var(--sub); }
  .sos { border-color:#f0c9d1; background:var(--rose-bg); }
  .sos .label { color:var(--rose); font-weight:700; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
  .sos .who { font-weight:600; margin-top:2px; }
  a.call { display:inline-block; margin-top:8px; background:var(--rose); color:#fff; text-decoration:none;
           font-weight:600; padding:8px 16px; border-radius:999px; }
  a.tel { color:var(--rose); text-decoration:none; font-weight:600; }
  .foot { margin-top:32px; text-align:center; color:var(--sub); font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">

  <div class="hero">
    <div class="eyebrow">{{ __('care.eyebrow') }}</div>
    <h1>{{ __('care.title', ['name' => $pet->name]) }}</h1>
    <div class="meta">
      {{ $L::label('types', $pet->type, ucfirst($pet->type)) }}{{ $pet->breed ? ' · '.$pet->breed : '' }}{{ $pet->weight ? ' · '.$L::decimal($pet->weight).' '.$pet->weight_unit : '' }}
    </div>
  </div>

  @if ($profile?->feeding)
    <h2>{{ __('care.feeding') }}</h2>
    <div class="card"><div class="pad prewrap">{{ $profile->feeding }}</div></div>
  @endif

  @if ($profile?->instructions)
    <h2>{{ __('care.instructions') }}</h2>
    <div class="card"><div class="pad prewrap">{{ $profile->instructions }}</div></div>
  @endif

  <h2>{{ __('care.medications') }}</h2>
  <div class="card">
    @forelse ($pet->medications as $med)
      <div class="row">
        <div>
          <div class="name">{{ $med->name }}</div>
          <div class="sub">{{ collect([$med->dosage, $L::label('frequencies', $med->frequency, str_replace('_', ' ', (string) $med->frequency))])->filter()->implode(' · ') }}</div>
        </div>
        @if (is_array($med->times) && count($med->times))
          <div class="right">{{ implode(', ', $med->times) }}</div>
        @endif
      </div>
    @empty
      <div class="empty">{{ __('care.no_medications') }}</div>
    @endforelse
  </div>

  @if ($profile?->emergency_name || $profile?->emergency_phone || $pet->clinics->isNotEmpty())
    <h2>{{ __('care.emergency') }}</h2>
    @if ($profile?->emergency_name || $profile?->emergency_phone)
      <div class="card sos pad" style="margin-bottom:10px;">
        <div class="label">{!! htmlspecialchars(__('care.sos'), ENT_NOQUOTES) !!}</div>{{-- text node: escape <>& but keep the apostrophe, so English stays byte-identical --}}
        @if ($profile->emergency_name)<div class="who">{{ $profile->emergency_name }}</div>@endif
        @if ($profile->emergency_phone)<a class="call" href="tel:{{ $profile->emergency_phone }}">{{ __('care.call', ['phone' => $profile->emergency_phone]) }}</a>@endif
      </div>
    @endif
    @foreach ($pet->clinics as $clinic)
      <div class="card" style="margin-bottom:8px;">
        <div class="row">
          <div>
            <div class="name">{{ $clinic->name }}</div>
            <div class="sub">{{ collect([$clinic->vet_name, $clinic->address])->filter()->implode(' · ') ?: __('care.vet_clinic') }}</div>
          </div>
          @if ($clinic->phone)<div class="right"><a class="tel" href="tel:{{ $clinic->phone }}">{{ $clinic->phone }}</a></div>@endif
        </div>
      </div>
    @endforeach
  @endif

  <div class="foot">
    {{ __('care.footer', ['expires' => $L::expiry($expiresAt, 'care.expires_format')]) }}
  </div>

</div>
</body>
</html>
