<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Permanent per-pet achievement badge, awarded idempotently by the nightly
 * gamification command (unique on pet_id + key). Never revoked.
 */
class Milestone extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    // Command-only write target (ComputeGamificationNightly). Never expose a
    // controller write path that mass-assigns pet_id from request input.
    // created_at records when the row was minted; earned_at can be backdated
    // (anniversaries are stamped on the anniversary itself, not run night).
    protected $fillable = ['pet_id', 'key', 'earned_at', 'created_at'];

    protected $casts = [
        'earned_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'key' => $this->key,
            'earned_at' => $this->earned_at?->toISOString(),
        ];
    }
}
