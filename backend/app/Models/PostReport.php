<?php

namespace App\Models;

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

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
