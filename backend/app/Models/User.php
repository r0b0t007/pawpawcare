<?php

namespace App\Models;

use App\Support\Uploads;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    use HasUuids;

    protected $keyType = 'string';

    public $incrementing = false;

    protected static function booted(): void
    {
        // Delete the old avatar file when it's replaced or cleared.
        static::updating(function (User $user) {
            if ($user->isDirty('avatar_url')) {
                Uploads::deleteByUrl($user->getOriginal('avatar_url'));
            }
        });
    }

    protected $fillable = [
        'name', 'email', 'hashed_password', 'avatar_url', 'bio', 'is_active', 'timezone',
        'provider', 'provider_id',
    ];

    protected $hidden = ['hashed_password', 'provider', 'provider_id'];

    protected $casts = [
        'is_active' => 'boolean',
        // `is_admin` is intentionally NOT fillable: it can only be set via the
        // `user:make-admin` artisan command (forceFill), never over HTTP.
        'is_admin' => 'boolean',
    ];

    public function pets(): HasMany
    {
        return $this->hasMany(Pet::class, 'owner_id');
    }

    /** Pets this user co-owns (shared with them), excluding ones they own. */
    public function memberPets(): BelongsToMany
    {
        return $this->belongsToMany(Pet::class, 'pet_members')
            ->withPivot('role', 'created_at');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class, 'author_id');
    }

    public function pawedPosts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, 'post_paws', 'user_id', 'post_id');
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(Group::class, 'group_members', 'user_id', 'group_id');
    }

    public function deviceTokens(): HasMany
    {
        return $this->hasMany(DeviceToken::class);
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(Reminder::class);
    }

    /** Serialize to the public `UserOut` shape. */
    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'avatar_url' => $this->avatar_url,
            'bio' => $this->bio,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /**
     * The /users/me shape: toApi() plus owner-only fields. `is_admin` lives
     * here — NOT in toApi() — so moderator status is disclosed only to the
     * account owner, never through endpoints that serialize other users
     * (e.g. the pet-sharing members list).
     */
    public function toSelfApi(): array
    {
        return array_merge($this->toApi(), ['is_admin' => (bool) $this->is_admin]);
    }
}
