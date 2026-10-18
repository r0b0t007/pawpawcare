<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Vaccination extends Model
{
    use HasUuids;

    /**
     * Vaccinations per pet (CHW-245): each due one is a reminder for everyone
     * sharing the pet. Decades of boosters stay far below it.
     */
    public const MAX_PER_PET = 200;

    public static function limitReached(string $petId): bool
    {
        return static::where('pet_id', $petId)->count() >= self::MAX_PER_PET;
    }

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    protected $fillable = ['pet_id', 'name', 'due_date', 'status', 'administered_date', 'notes'];

    protected $attributes = [
        'status' => 'upcoming',
    ];

    protected $casts = [
        'due_date' => 'date:Y-m-d',
        'administered_date' => 'date:Y-m-d',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    /** Serialize to the public `VaccinationOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'due_date' => $this->due_date?->format('Y-m-d'),
            'status' => $this->status,
            'administered_date' => $this->administered_date?->format('Y-m-d'),
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
