<?php

namespace Tests\Unit;

use App\Support\WeightInsight;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

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
        $this->assertStringContainsString('Down 0.5 kg (-10%)', $insight['summary']);
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
}
