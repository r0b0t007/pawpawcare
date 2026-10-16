<?php

namespace Tests\Unit;

use App\Support\WeightInsight;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\App;
use Tests\TestCase;

class WeightInsightTest extends TestCase
{
    /** Build a weight-log-like row. */
    private function log(float $weight, string $unit, string $date): object
    {
        return (object) ['weight' => $weight, 'unit' => $unit, 'logged_at' => Carbon::parse($date)];
    }

    public function test_returns_null_with_fewer_than_two_logs(): void
    {
        $this->assertNull(WeightInsight::for([], 'kg'));
        $this->assertNull(WeightInsight::for([$this->log(4.0, 'kg', '2026-01-01')], 'kg'));
    }

    public function test_detects_an_upward_trend_and_flags_it_as_notable(): void
    {
        $insight = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.4, 'kg', '2026-02-01'),
            $this->log(4.8, 'kg', '2026-04-01'),
        ], 'kg');

        $this->assertSame('up', $insight['direction']);
        $this->assertSame(0.8, $insight['change_abs']);
        $this->assertSame(20.0, $insight['change_pct']);
        $this->assertSame(4.8, $insight['current']);
        $this->assertTrue($insight['notable']); // 20% ≥ 10%
        $this->assertStringContainsString('Up 0.8 kg (20%)', $insight['summary']);
        $this->assertStringContainsString('months', $insight['summary']);
    }

    public function test_detects_a_downward_trend(): void
    {
        $insight = WeightInsight::for([
            $this->log(5.0, 'kg', '2026-01-01'),
            $this->log(4.5, 'kg', '2026-03-01'),
        ], 'kg');

        $this->assertSame('down', $insight['direction']);
        $this->assertSame(-0.5, $insight['change_abs']);
        $this->assertSame(-10.0, $insight['change_pct']);
        $this->assertTrue($insight['notable']);
        // "Down" carries the sign — the percent is shown unsigned.
        $this->assertStringContainsString('Down 0.5 kg (10%)', $insight['summary']);
    }

    public function test_the_stable_threshold_is_exclusive(): void
    {
        // Exactly 3% is NOT stable (stable is |change| < 3%).
        $insight = WeightInsight::for([
            $this->log(4.00, 'kg', '2026-01-01'),
            $this->log(4.12, 'kg', '2026-03-01'),
        ], 'kg');

        $this->assertSame(3.0, $insight['change_pct']);
        $this->assertSame('up', $insight['direction']);
    }

    public function test_span_crosses_from_weeks_to_months_at_sixty_days(): void
    {
        // 59 days → weeks, 60 days → months.
        $weeks = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.0, 'kg', '2026-03-01'), // 59 days
        ], 'kg');
        $months = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.0, 'kg', '2026-03-02'), // 60 days
        ], 'kg');

        $this->assertStringContainsString('weeks', $weeks['summary']);
        $this->assertStringContainsString('months', $months['summary']);
    }

    public function test_small_changes_are_stable_and_not_notable(): void
    {
        $insight = WeightInsight::for([
            $this->log(4.00, 'kg', '2026-01-01'),
            $this->log(4.05, 'kg', '2026-02-15'),
        ], 'kg');

        $this->assertSame('stable', $insight['direction']); // 1.25% < 3%
        $this->assertFalse($insight['notable']);
        $this->assertStringStartsWith('Stable over the last', $insight['summary']);
    }

    public function test_converts_logs_to_the_pets_unit(): void
    {
        // Logs stored in kg, but the pet now displays in lb.
        $insight = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.4, 'kg', '2026-03-01'),
        ], 'lb');

        $this->assertSame('lb', $insight['unit']);
        $this->assertSame(9.7, $insight['current']); // 4.4 kg → 9.70 lb
        $this->assertSame('up', $insight['direction']);
        $this->assertStringContainsString('lb', $insight['summary']);
    }

    public function test_orders_logs_chronologically_regardless_of_input_order(): void
    {
        $insight = WeightInsight::for([
            $this->log(4.8, 'kg', '2026-04-01'), // newest first in input
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.4, 'kg', '2026-02-01'),
        ], 'kg');

        // Still measured earliest (4.0) → latest (4.8).
        $this->assertSame(0.8, $insight['change_abs']);
        $this->assertSame(4.8, $insight['current']);
    }

    public function test_humanizes_short_spans_in_days(): void
    {
        $insight = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.5, 'kg', '2026-01-06'),
        ], 'kg');

        $this->assertSame(5, $insight['period_days']);
        $this->assertStringContainsString('5 days', $insight['summary']);
    }

    // ── Localized summaries (vet share page in the link's language) ──────────

    public function test_english_summaries_are_unchanged_including_one_day_spans(): void
    {
        $up = WeightInsight::for([$this->log(4.0, 'kg', '2026-01-01'), $this->log(4.8, 'kg', '2026-04-01')], 'kg', 'en');
        $oneDay = WeightInsight::for([$this->log(4.0, 'kg', '2026-01-01'), $this->log(4.0, 'kg', '2026-01-02')], 'kg', 'en');
        $sameDay = WeightInsight::for([$this->log(4.0, 'kg', '2026-01-01'), $this->log(4.0, 'kg', '2026-01-01')], 'kg', 'en');

        $this->assertSame('Up 0.8 kg (20%) over the last 3 months', $up['summary']);
        $this->assertSame('Stable over the last 1 day', $oneDay['summary']);
        // Historical wording for same-day logs, kept byte-identical.
        $this->assertSame('Stable over the last 1 days', $sameDay['summary']);
    }

    public function test_the_locale_argument_only_changes_the_wording(): void
    {
        $logs = [$this->log(4.0, 'kg', '2026-01-01'), $this->log(4.8, 'kg', '2026-04-01')];
        $en = WeightInsight::for($logs, 'kg', 'en');

        foreach (['fr', 'es'] as $locale) {
            $other = WeightInsight::for($logs, 'kg', $locale);
            unset($other['summary']);
            $this->assertSame(array_diff_key($en, ['summary' => true]), $other);
        }
    }

    public function test_french_summaries_use_french_plurals_and_decimals(): void
    {
        $up = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.8, 'kg', '2026-04-01'),
        ], 'kg', 'fr');
        $down = WeightInsight::for([
            $this->log(5.0, 'kg', '2026-01-01'),
            $this->log(4.5, 'kg', '2026-01-29'),
        ], 'kg', 'fr');
        $stable = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.0, 'kg', '2026-01-02'),
        ], 'kg', 'fr');
        $days = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.0, 'kg', '2026-01-06'),
        ], 'kg', 'fr');

        $this->assertSame("En hausse de 0,8 kg (20\u{00A0}%) sur les 3 derniers mois", $up['summary']);
        $this->assertSame("En baisse de 0,5 kg (10\u{00A0}%) sur les 4 dernières semaines", $down['summary']);
        $this->assertSame('Stable sur le dernier jour', $stable['summary']);
        $this->assertSame('Stable sur les 5 derniers jours', $days['summary']);
    }

    public function test_spanish_summaries_use_spanish_plurals_and_decimals(): void
    {
        $up = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.3, 'kg', '2026-01-02'),
        ], 'kg', 'es');
        $down = WeightInsight::for([
            $this->log(5.0, 'kg', '2026-01-01'),
            $this->log(4.5, 'kg', '2026-03-02'),
        ], 'kg', 'es');
        $stable = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.05, 'kg', '2026-02-12'),
        ], 'kg', 'es');

        $this->assertSame("Sube 0,3 kg (7,5\u{00A0}%) en el último día", $up['summary']);
        $this->assertSame("Baja 0,5 kg (10\u{00A0}%) en los últimos 2 meses", $down['summary']);
        $this->assertSame('Estable en las últimas 6 semanas', $stable['summary']);
    }

    public function test_the_summary_defaults_to_the_current_app_locale(): void
    {
        App::setLocale('es');

        $insight = WeightInsight::for([
            $this->log(4.0, 'kg', '2026-01-01'),
            $this->log(4.5, 'kg', '2026-01-06'),
        ], 'kg');

        $this->assertSame("Sube 0,5 kg (12,5\u{00A0}%) en los últimos 5 días", $insight['summary']);
        // Only the sentence is localized; the numbers stay machine-readable.
        $this->assertSame(0.5, $insight['change_abs']);
        $this->assertSame(12.5, $insight['change_pct']);
    }
}
