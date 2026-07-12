<?php

namespace App\Models;

use App\Support\Uploads;
use Illuminate\Database\Eloquent\Builder;
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

    protected static function booted(): void
    {
        static::updating(function (Post $post) {
            if ($post->isDirty('image_url')) {
                Uploads::deleteByUrl($post->getOriginal('image_url'));
            }
        });

        static::deleting(fn (Post $post) => Uploads::deleteByUrl($post->image_url));
    }

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

    public function reports(): HasMany
    {
        return $this->hasMany(PostReport::class);
    }

    /**
     * Open reports only. Dismissed reports stay in `reports` as an audit
     * trail but no longer count toward hiding or the moderation queue.
     */
    public function activeReports(): HasMany
    {
        return $this->hasMany(PostReport::class)->whereNull('dismissed_at');
    }

    /** How many distinct reports pull a post from everyone else's feed. */
    public const REPORT_HIDE_THRESHOLD = 3;

    /**
     * Feed visibility: posts reported by 3+ distinct users disappear for
     * everyone except their author (who keeps seeing their own post).
     * Individual "hidden for me" filtering is a client concern driven by
     * the `reported_by_me` flag — never a server-side exclusion.
     */
    public function scopeVisibleTo(Builder $query, string $userId): Builder
    {
        return $query->where(function (Builder $q) use ($userId) {
            $q->where('author_id', $userId)
                ->orHas('activeReports', '<', self::REPORT_HIDE_THRESHOLD);
        });
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
            // `reported_by_me` drives the client's collapsed "hidden" state.
            // Report *counts* are intentionally never exposed.
            'reported_by_me' => (bool) ($this->reported_by_me
                ?? $this->activeReports()->where('user_id', $currentUserId)->exists()),
            'author_name' => $this->author?->name ?? '',
            'author_avatar' => $this->author?->avatar_url,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
