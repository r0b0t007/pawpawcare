<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Medication extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'pet_id', 'name', 'dosage', 'frequency', 'times',
        'start_date', 'end_date', 'notes', 'active',
    ];

    protected $attributes = [
        'frequency' => 'daily',
        'active' => true,
    ];

    protected $casts = [
        'times' => 'array',
        'active' => 'boolean',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(MedicationLog::class);
    }

    /** Serialize to the public medication shape. */
    public function toApi(): array
    {
        // `logs_max_administered_at` is provided by ->withMax('logs', 'administered_at').
        $lastDose = $this->logs_max_administered_at ?? null;

        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'dosage' => $this->dosage,
            'frequency' => $this->frequency,
            'times' => is_array($this->times) ? $this->times : [],
            'start_date' => $this->start_date?->format('Y-m-d'),
            'end_date' => $this->end_date?->format('Y-m-d'),
            'notes' => $this->notes,
            'active' => (bool) $this->active,
            'last_administered_at' => $lastDose ? Carbon::parse($lastDose)->toISOString() : null,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
