<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CareProfile extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    // pet_id is fillable (per the codebase convention) but only ever set
    // server-side from the verified route — never from request input.
    protected $fillable = ['pet_id', 'feeding', 'instructions', 'emergency_name', 'emergency_phone'];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function toApi(): array
    {
        return [
            'pet_id' => $this->pet_id,
            'feeding' => $this->feeding,
            'instructions' => $this->instructions,
            'emergency_name' => $this->emergency_name,
            'emergency_phone' => $this->emergency_phone,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
