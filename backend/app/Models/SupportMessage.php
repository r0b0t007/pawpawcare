<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportMessage extends Model
{
    use HasUuids;

    /** What the person is writing about; null for older apps. */
    public const CATEGORIES = ['feedback', 'problem', 'idea', 'question'];

    protected $keyType = 'string';

    public $incrementing = false;

    const UPDATED_AT = null;

    // user_id is set explicitly from the authenticated user, never filled.
    protected $fillable = ['message', 'category', 'app_version', 'platform'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Serialize to the public shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'message' => $this->message,
            'category' => $this->category,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
