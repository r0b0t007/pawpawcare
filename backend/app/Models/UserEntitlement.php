<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's state for one RevenueCat entitlement. Written only by
 * App\Services\Subscriptions\EntitlementWriter (never from request input),
 * so nothing is fillable.
 */
class UserEntitlement extends Model
{
    protected $guarded = ['*'];

    protected $casts = [
        'is_lifetime' => 'boolean',
        'expires_at' => 'datetime',
        'grace_expires_at' => 'datetime',
        'billing_issue_at' => 'datetime',
        'unsubscribed_at' => 'datetime',
        'will_renew' => 'boolean',
        'last_event_ms' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Active = a lifetime purchase, or not yet expired (counting a billing
     * grace period). A missing expiry is never lifetime on its own.
     */
    public function isActive(): bool
    {
        return $this->is_lifetime
            || ($this->expires_at !== null && $this->expires_at->isFuture())
            || ($this->grace_expires_at !== null && $this->grace_expires_at->isFuture());
    }
}
