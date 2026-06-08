<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pet extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'owner_id', 'name', 'type', 'breed', 'age', 'birthday', 'weight',
        'weight_unit', 'gender', 'microchipped', 'color', 'avatar_url',
        'heart_rate', 'activity_level',
    ];

    protected $attributes = [
        'type' => 'dog',
        'weight_unit' => 'kg',
        'microchipped' => false,
    ];

    protected $casts = [
        'age' => 'float',
        'weight' => 'float',
        'heart_rate' => 'integer',
        'microchipped' => 'boolean',
        'birthday' => 'date:Y-m-d',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function vaccinations(): HasMany
    {
        return $this->hasMany(Vaccination::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function favoriteFoods(): HasMany
    {
        return $this->hasMany(FavoriteFood::class);
    }

    public function medications(): HasMany
    {
        return $this->hasMany(Medication::class);
    }

    /** Serialize to the public `PetOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'owner_id' => $this->owner_id,
            'name' => $this->name,
            'type' => $this->type,
            'breed' => $this->breed,
            'age' => $this->age,
            'birthday' => $this->birthday?->format('Y-m-d'),
            'weight' => $this->weight,
            'weight_unit' => $this->weight_unit,
            'gender' => $this->gender,
            'microchipped' => (bool) $this->microchipped,
            'color' => $this->color,
            'avatar_url' => $this->avatar_url,
            'heart_rate' => $this->heart_rate,
            'activity_level' => $this->activity_level,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
