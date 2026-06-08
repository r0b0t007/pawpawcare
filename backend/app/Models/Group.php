<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Group extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    protected $fillable = ['name', 'description', 'location', 'icon'];

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'group_members', 'group_id', 'user_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    /** Serialize to the public `GroupOut` shape, relative to the current user. */
    public function toApi(string $currentUserId): array
    {
        $memberIds = $this->members->pluck('id');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'location' => $this->location,
            'icon' => $this->icon,
            'member_count' => $memberIds->count(),
            'is_member' => $memberIds->contains($currentUserId),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
