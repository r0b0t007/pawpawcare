<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appointment extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['pet_id', 'clinic_id', 'title', 'scheduled_at', 'status', 'notes'];

    protected $attributes = [
        'status' => 'scheduled',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'clinic_id' => $this->clinic_id,
            'clinic_name' => $this->relationLoaded('clinic') && $this->clinic ? $this->clinic->name : null,
            'title' => $this->title,
            'scheduled_at' => $this->scheduled_at?->toISOString(),
            'status' => $this->status,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
