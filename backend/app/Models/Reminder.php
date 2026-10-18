<?php

namespace App\Models;

use App\Services\ReminderScheduler;
use App\Support\ReminderText;
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
        'last_fired_at', 'next_fire_at', 'template', 'template_params',
    ];

    protected $casts = [
        'fire_at' => 'datetime',
        'last_fired_at' => 'datetime',
        'next_fire_at' => 'datetime',
        'lead_time_days' => 'integer',
        'enabled' => 'boolean',
        'template_params' => 'array',
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

    /**
     * The title in a language (default: the current app locale, which
     * SetLocale sets to the request user's). Auto-generated reminders render
     * their template; user-created ones (no template) return their own text
     * untouched, as does any row whose template can't be rendered.
     */
    public function localizedTitle(?string $locale = null): string
    {
        return ReminderText::title($this->template, $this->template_params, $locale) ?? $this->title;
    }

    /** The body in a language; see localizedTitle(). */
    public function localizedBody(?string $locale = null): ?string
    {
        [$rendered, $body] = ReminderText::body($this->template, $this->template_params, $locale);

        return $rendered ? $body : $this->body;
    }

    /** Serialize to the public reminder shape, in the current app locale. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'type' => $this->type,
            'title' => $this->localizedTitle(),
            'body' => $this->localizedBody(),
            'schedule_type' => $this->schedule_type,
            'fire_at' => $this->fire_at?->toISOString(),
            'recurrence' => $this->recurrence,
            'time_of_day' => $this->time_of_day,
            'lead_time_days' => $this->lead_time_days,
            'timezone' => $this->timezone,
            'enabled' => (bool) $this->enabled,
            'next_fire_at' => $this->next_fire_at?->toISOString(),
            // Every occurrence in the next week, for the app's offline local
            // notifications (ReminderScheduler::upcomingFireTimes).
            'upcoming_fire_at' => array_map(fn ($t) => $t->toISOString(), ReminderScheduler::upcomingFireTimes($this)),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
