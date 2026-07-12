<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostReport extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    protected $fillable = ['user_id', 'post_id'];

    protected $casts = ['dismissed_at' => 'datetime'];

    /**
     * How long an admin's dismissal suppresses re-queuing by the same
     * reporter. A different user can re-report (and re-queue) immediately;
     * the original reporter's dismissed row only re-opens after this window.
     */
    public const DISMISS_COOLDOWN_DAYS = 30;

    /** Open reports — the ones that count toward hiding and the review queue. */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('dismissed_at');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
