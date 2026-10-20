<?php

namespace App\Models;

use App\Exceptions\PetLimitReached;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Medication extends Model
{
    use HasUuids;

    /**
     * Dose times per medication (CHW-243). Each is one recurring reminder per
     * person sharing the pet; the app offers a handful of preset times.
     */
    public const MAX_DOSE_TIMES = 12;

    /**
     * Medications with reminders per pet (CHW-245): each is up to
     * MAX_DOSE_TIMES recurring reminders for everyone sharing the pet.
     * Stopped and "as needed" ones make none (ReminderScheduler) and don't
     * count; one past its end_date still reminds until stopped, so it does.
     */
    public const MAX_ACTIVE_PER_PET = 30;

    /** Whether a medication with these values makes reminders. */
    public static function makesReminders(bool $active, ?string $frequency): bool
    {
        return $active && $frequency !== 'as_needed';
    }

    /** How many of a pet's medications make reminders. */
    public static function withRemindersCount(string $petId): int
    {
        return static::where('pet_id', $petId)->where('active', true)->where('frequency', '!=', 'as_needed')->count();
    }

    /** The 422 for one more medication with reminders past the limit. */
    public static function abortAtLimit(): never
    {
        throw new PetLimitReached(__('This pet already has :max medications with reminders. Stop or delete one to add another.', ['max' => self::MAX_ACTIVE_PER_PET]));
    }

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'pet_id', 'name', 'dosage', 'frequency', 'times',
        'start_date', 'end_date', 'notes', 'active',
    ];

    protected $attributes = [
        'frequency' => 'daily',
        'active' => true,
    ];

    protected $casts = [
        'times' => 'array',
        'active' => 'boolean',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
    ];

    public function pet(): BelongsTo
    {
        return $this->belongsTo(Pet::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(MedicationLog::class);
    }

    /** Serialize to the public medication shape. */
    public function toApi(): array
    {
        // `logs_max_administered_at` is provided by ->withMax('logs', 'administered_at').
        $lastDose = $this->logs_max_administered_at ?? null;

        return [
            'id' => $this->id,
            'pet_id' => $this->pet_id,
            'name' => $this->name,
            'dosage' => $this->dosage,
            'frequency' => $this->frequency,
            'times' => is_array($this->times) ? $this->times : [],
            'start_date' => $this->start_date?->format('Y-m-d'),
            'end_date' => $this->end_date?->format('Y-m-d'),
            'notes' => $this->notes,
            'active' => (bool) $this->active,
            'last_administered_at' => $lastDose ? Carbon::parse($lastDose)->toISOString() : null,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
