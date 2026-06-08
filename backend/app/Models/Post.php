<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Post extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['author_id', 'content', 'image_url', 'group_id'];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    public function pawedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'post_paws', 'post_id', 'user_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }

    /** Serialize to the public `PostOut` shape, relative to the current user. */
    public function toApi(string $currentUserId): array
    {
        $pawedIds = $this->pawedBy->pluck('id');

        return [
            'id' => $this->id,
            'author_id' => $this->author_id,
            'content' => $this->content,
            'image_url' => $this->image_url,
            'group_id' => $this->group_id,
            'paw_count' => $pawedIds->count(),
            'pawed_by_me' => $pawedIds->contains($currentUserId),
            'comment_count' => $this->comments_count ?? $this->comments()->count(),
            'author_name' => $this->author?->name ?? '',
            'author_avatar' => $this->author?->avatar_url,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
