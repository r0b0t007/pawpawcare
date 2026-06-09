<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PetInvite extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['pet_id', 'invited_by', 'email', 'status'];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'pet' => $this->relationLoaded('pet') && $this->pet ? $this->pet->toApi() : null,
            'email' => $this->email,
            'status' => $this->status,
            'invited_by' => $this->invited_by,
            'inviter' => $this->relationLoaded('inviter') && $this->inviter ? $this->inviter->toApi() : null,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
