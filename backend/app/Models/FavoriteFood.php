<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FavoriteFood extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    protected $table = 'favorite_foods';

    protected $fillable = ['pet_id', 'name'];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    /** Serialize to the public `FavoriteFoodOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
