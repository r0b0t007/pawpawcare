<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Clinic extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['pet_id', 'name', 'vet_name', 'phone', 'email', 'address', 'notes'];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'vet_name' => $this->vet_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'address' => $this->address,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
