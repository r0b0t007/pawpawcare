<?php

namespace App\Models;

use App\Casts\UploadUrl;
use App\Services\Analytics\ProductAnalytics;
use App\Services\Subscriptions\Entitlements;
use App\Support\Uploads;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    use HasUuids;

    /**
     * Days between a deletion request and the permanent purge. Within this
     * window logging back in cancels the deletion (GDPR-style grace period).
     */
    public const DELETION_GRACE_DAYS = 30;

    protected $keyType = 'string';

    public $incrementing = false;

    protected static function booted(): void
    {
        // Delete the old avatar file once it's been replaced or cleared. Runs
        // after the write so this row no longer references the file.
        static::updated(function (User $user) {
            if ($user->wasChanged('avatar_url')) {
                Uploads::deleteIfOrphaned($user->getOriginal('avatar_url'));
            }
        });
    }

    protected $fillable = [
        'name', 'email', 'hashed_password', 'avatar_url', 'bio', 'is_active', 'timezone',
        'provider', 'provider_id',
    ];

    protected $hidden = ['hashed_password', 'provider', 'provider_id'];

    protected $casts = [
        'avatar_url' => UploadUrl::class,
        'is_active' => 'boolean',
        // `is_admin` is intentionally NOT fillable: it can only be set via the
        // `user:make-admin` artisan command (forceFill), never over HTTP.
        'is_admin' => 'boolean',
        // Not fillable either — only DELETE /users/me (forceFill) sets it.
        'deletion_requested_at' => 'datetime',
        // Assigned explicitly in UserController::update, not mass-assigned.
        'engagement_pushes_enabled' => 'boolean',
        'analytics_opt_out' => 'boolean',
        // Neither is fillable: bumped by revokeAllSessions() / set by the
        // email-verification, password-reset and social-link flows (forceFill).
        'token_version' => 'integer',
        'email_verified_at' => 'datetime',
    ];

    /**
     * Accounts whose self-deletion grace period has passed. Requiring the
     * account to still be disabled means an active account can never be
     * purged, whatever else sets is_active.
     */
    public function scopeDueForPurge(Builder $query): Builder
    {
        return $query->where('is_active', false)
            ->whereNotNull('deletion_requested_at')
            ->where('deletion_requested_at', '<=', now()->subDays(self::DELETION_GRACE_DAYS));
    }

    /**
     * Cancel a pending self-deletion (the user signed back in or reset their
     * password during the grace period). The single place that reactivates,
     * so every path is tracked the same way.
     *
     * A conditional update, not a save: it only succeeds while the deletion
     * is still pending. If the nightly purge holds this row's lock, the update
     * waits for it and then changes nothing — returns false, and the caller
     * must not treat the account as restored.
     */
    public function cancelPendingDeletion(string $method): bool
    {
        $changed = static::whereKey($this->id)
            ->where('is_active', false)
            ->whereNotNull('deletion_requested_at')
            ->update(['is_active' => true, 'deletion_requested_at' => null]);
        if ($changed !== 1) {
            return false;
        }

        $this->forceFill(['is_active' => true, 'deletion_requested_at' => null])->syncOriginal();
        app(ProductAnalytics::class)->capture($this, 'server_account_reactivated', ['method' => $method]);

        return true;
    }

    /**
     * Kill every credential issued so far: refresh tokens, all outstanding
     * access tokens (via the `ver` claim JwtAuth checks), and push-device
     * bindings. Used whenever control of the account changes hands.
     */
    public function revokeAllSessions(): void
    {
        // DB-side increment: concurrent revocations can't collapse into one.
        $this->increment('token_version');
        RefreshToken::where('user_id', $this->id)->delete();
        $this->deviceTokens()->delete();
    }

    public function hasVerifiedEmail(): bool
    {
        return $this->email_verified_at !== null;
    }

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
        $entitlements = app(Entitlements::class);

        return array_merge($this->toApi(), [
            'is_admin' => (bool) $this->is_admin,
            'engagement_pushes_enabled' => (bool) $this->engagement_pushes_enabled,
            'analytics_opt_out' => (bool) $this->analytics_opt_out,
            'email_verified' => $this->hasVerifiedEmail(),
            // Subscription state + server-side switches (paywall, visibility,
            // which features would ask this user to upgrade).
            'plan' => $entitlements->snapshot($this),
            'features' => $entitlements->features($this),
        ]);
    }
}
