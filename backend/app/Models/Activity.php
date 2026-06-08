<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Activity extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    protected $fillable = ['pet_id', 'name', 'duration', 'time_of_day', 'icon'];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    /** Serialize to the public `ActivityOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'duration' => $this->duration,
            'time_of_day' => $this->time_of_day,
            'icon' => $this->icon,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
