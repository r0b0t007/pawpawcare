<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReminderDelivery extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'reminder_id', 'occurrence_at', 'channel', 'status',
        'snoozed_until', 'sent_at', 'read_at',
    ];

    protected $casts = [
        'occurrence_at' => 'datetime',
        'snoozed_until' => 'datetime',
        'sent_at' => 'datetime',
        'read_at' => 'datetime',
    ];

    public function reminder(): BelongsTo
    {
        return $this->belongsTo(Reminder::class);
    }

    /** Serialize to the notification-center shape (includes reminder context). */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'reminder_id' => $this->reminder_id,
            'occurrence_at' => $this->occurrence_at?->toISOString(),
            'channel' => $this->channel,
            'status' => $this->status,
            'snoozed_until' => $this->snoozed_until?->toISOString(),
            'read_at' => $this->read_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            // Denormalized reminder context for rendering without an extra fetch:
            'type' => $this->reminder?->type,
            'pet_id' => $this->reminder?->pet_id,
            'title' => $this->reminder?->localizedTitle(),
            'body' => $this->reminder?->localizedBody(),
        ];
    }
}
