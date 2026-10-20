<?php

namespace App\Models;

use App\Casts\UploadUrl;
use App\Support\Uploads;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Pet extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected static function booted(): void
    {
        // Delete the old avatar file once it's been replaced or cleared. Runs
        // after the write so this row no longer references the file.
        static::updated(function (Pet $pet) {
            if ($pet->wasChanged('avatar_url')) {
                Uploads::deleteIfOrphaned($pet->getOriginal('avatar_url'));
            }
        });

        static::deleted(fn (Pet $pet) => Uploads::deleteIfOrphaned($pet->avatar_url));

        static::deleting(function (Pet $pet) {
            // DB-level FK cascades bypass Eloquent events, so clean up the lost-pet
            // broadcast posts here before the pet (and its reports) are removed.
            $postIds = $pet->lostPetReports()->whereNotNull('post_id')->pluck('post_id');
            if ($postIds->isNotEmpty()) {
                Post::whereIn('id', $postIds)->delete();
            }

            // Likewise, the DB cascade would drop document rows without firing their
            // model hook — delete the underlying files here so nothing is orphaned.
            foreach ($pet->documents()->pluck('file_path') as $path) {
                Uploads::deletePrivate($path);
            }
        });
    }

    protected $fillable = [
        'owner_id', 'name', 'type', 'breed', 'age', 'birthday', 'adopted_on',
        'weight', 'weight_unit', 'gender', 'microchipped', 'color', 'avatar_url',
        'heart_rate', 'activity_level',
    ];

    protected $attributes = [
        'type' => 'dog',
        'weight_unit' => 'kg',
        'microchipped' => false,
    ];

    protected $casts = [
        'avatar_url' => UploadUrl::class,
        'age' => 'float',
        'weight' => 'float',
        'heart_rate' => 'integer',
        'microchipped' => 'boolean',
        'birthday' => 'date:Y-m-d',
        'adopted_on' => 'date:Y-m-d',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * Lock this pet's row until the surrounding transaction ends, so per-pet
     * limit checks (Medication::MAX_ACTIVE_PER_PET, Vaccination::MAX_PER_PET)
     * and the insert after them run one request at a time (CHW-245).
     */
    public static function lockForRecordWrites(string $petId): void
    {
        static::whereKey($petId)->lockForUpdate()->first();
    }

    /** Co-owners granted access in addition to the owner. */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'pet_members')
            ->withPivot('role', 'created_at');
    }

    /** @return list<string> the owner's and every co-owner's user id */
    public function participantIds(): array
    {
        return array_values(array_unique([
            $this->owner_id,
            ...$this->members()->pluck('users.id')->all(),
        ]));
    }

    public function invites(): HasMany
    {
        return $this->hasMany(PetInvite::class);
    }

    /**
     * Limit a query to pets the given user can access — ones they own outright
     * or have been added to as a co-owner.
     */
    public function scopeAccessibleBy(Builder $query, string $userId): Builder
    {
        return $query->where(function (Builder $q) use ($userId) {
            $q->where('owner_id', $userId)
                ->orWhereHas('members', fn (Builder $m) => $m->where('users.id', $userId));
        });
    }

    public function vaccinations(): HasMany
    {
        return $this->hasMany(Vaccination::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function favoriteFoods(): HasMany
    {
        return $this->hasMany(FavoriteFood::class);
    }

    public function medications(): HasMany
    {
        return $this->hasMany(Medication::class);
    }

    public function lostPetReports(): HasMany
    {
        return $this->hasMany(LostPetReport::class);
    }

    public function weightLogs(): HasMany
    {
        return $this->hasMany(WeightLog::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    public function clinics(): HasMany
    {
        return $this->hasMany(Clinic::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function careProfile(): HasOne
    {
        return $this->hasOne(CareProfile::class);
    }

    /** Serialize to the public `PetOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'owner_id' => $this->owner_id,
            'name' => $this->name,
            'type' => $this->type,
            'breed' => $this->breed,
            'age' => $this->age,
            'birthday' => $this->birthday?->format('Y-m-d'),
            'adopted_on' => $this->adopted_on?->format('Y-m-d'),
            'weight' => $this->weight,
            'weight_unit' => $this->weight_unit,
            'gender' => $this->gender,
            'microchipped' => (bool) $this->microchipped,
            'color' => $this->color,
            'avatar_url' => $this->avatar_url,
            'heart_rate' => $this->heart_rate,
            'activity_level' => $this->activity_level,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
