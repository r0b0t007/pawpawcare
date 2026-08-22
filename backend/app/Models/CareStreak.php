<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-pet weekly care streak — nightly-recomputed cache over the care-signal
 * tables (see ComputeGamificationNightly). Shared: any family member's logged
 * care counts toward the pet's streak.
 */
class CareStreak extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    // Command-only write target (ComputeGamificationNightly). Never expose a
    // controller write path that mass-assigns pet_id from request input.
    protected $fillable = [
        'pet_id', 'current_weeks', 'longest_weeks', 'last_qualifying_week_start',
    ];

    protected $casts = [
        'current_weeks' => 'integer',
        'longest_weeks' => 'integer',
        'last_qualifying_week_start' => 'date:Y-m-d',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function toApi(): array
    {
        return [
            'pet_id' => $this->pet_id,
            'current_weeks' => $this->current_weeks,
            'longest_weeks' => $this->longest_weeks,
            'last_qualifying_week_start' => $this->last_qualifying_week_start?->format('Y-m-d'),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
