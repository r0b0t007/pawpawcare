<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Reminder extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'user_id', 'pet_id', 'type', 'related_type', 'related_id',
        'title', 'body', 'schedule_type', 'fire_at', 'recurrence',
        'time_of_day', 'lead_time_days', 'timezone', 'enabled',
        'last_fired_at', 'next_fire_at',
    ];

    protected $casts = [
        'fire_at' => 'datetime',
        'last_fired_at' => 'datetime',
        'next_fire_at' => 'datetime',
        'lead_time_days' => 'integer',
        'enabled' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(ReminderDelivery::class);
    }

    /** Serialize to the public reminder shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'type' => $this->type,
            'title' => $this->title,
            'body' => $this->body,
            'schedule_type' => $this->schedule_type,
            'fire_at' => $this->fire_at?->toISOString(),
            'recurrence' => $this->recurrence,
            'time_of_day' => $this->time_of_day,
            'lead_time_days' => $this->lead_time_days,
            'timezone' => $this->timezone,
            'enabled' => (bool) $this->enabled,
            'next_fire_at' => $this->next_fire_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
